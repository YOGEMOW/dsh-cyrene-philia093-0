/**
 * 夜梦调度（宿主侧）。
 *
 * 机制（沿用一页永恒的成熟做法）：
 *   1. 昔涟会话第一次出现时，用 DSH 的 `schedule` 服务给它挂一条每日 23:30 的任务，
 *      任务内容是一条带 `[cyrene-dream]` 标记的 prompt；
 *   2. 该标记作为用户消息到达时，宿主在 `agent/pre-step` 里把完整的六阶段规程注入到标记之后；
 *   3. `turn/end` 时收尾：标日档 dreamed、兜底梦志、释放租约、按需快照。
 *
 * 默认开（config.dream.enabled），全部 fail-open：schedule 服务不可用只记日志。
 */
import { appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  DREAM_MARKER,
  acquireDreamLease,
  buildDreamPrompt,
  dayOf,
  dreamedToday,
  loadDreamState,
  logDream,
  markDayDreamed,
  releaseDreamLease,
  saveDreamState,
  writeDreamJournal,
} from '../memory/dream.js'
import { loadEntries } from '../memory/entries.js'
import { buildDayNote } from '../memory/journal.js'
import { snapshotRoot } from '../memory/backup.js'
import { createPluginMessage, textOf } from '../runtime/rails.mjs'

const DREAM_TITLE = '一页永恒·夜梦'
const DREAM_TRIGGER_TEXT = `${DREAM_MARKER} 夜梦整理：按插件注入的规程执行今天的六阶段整理。`

/**
 * 安装夜梦调度。
 * @param ctx 宿主上下文
 * @param service cyreneMemory 服务
 * @returns disposer
 */
export function installDream(ctx, service) {
  const root = service?.root
  const cfg = service?.config
  if (typeof root !== 'string' || root === '' || cfg?.dream?.enabled !== true) return () => {}
  const state = loadDreamState(root)
  const disposers = []

  const logMeta = (file, line) => {
    try {
      appendFileSync(join(root, '元', file), `[${new Date().toISOString()}] ${line}\n`)
    } catch {
      /* ignore */
    }
  }

  /** 当前会话的 preset id（注册表提供的组合查询）。 */
  const presetOf = (agent) => {
    try {
      return String(ctx.get('agentPresets')?.composedPreset(agent?.ctx) ?? '')
    } catch {
      return ''
    }
  }
  const allowed = (agent) => Array.isArray(cfg.injectPresets) && cfg.injectPresets.includes(presetOf(agent))

  /** 取 schedule 服务（没有就跳过）。 */
  const scheduleService = () => {
    try {
      const svc = ctx.get('schedule')
      return svc !== null && typeof svc === 'object' && typeof svc.create === 'function' ? svc : null
    } catch {
      return null
    }
  }

  /** 活着的昔涟 agents，按会话创建时间从新到旧。 */
  const liveCyreneAgents = () => {
    try {
      const agents = ctx.get('agents')
      const registry = ctx.get('agentPresets')
      if (agents === null || typeof agents !== 'object' || typeof agents.list !== 'function') return []
      const list = agents.list()
      if (!Array.isArray(list)) return []
      return list
        .filter((agent) => {
          try {
            return cfg.injectPresets.includes(String(registry?.composedPreset(agent.ctx) ?? ''))
          } catch {
            return false
          }
        })
        .sort((a, b) => Number(b?.session?.header?.createdAt ?? 0) - Number(a?.session?.header?.createdAt ?? 0))
    } catch {
      return []
    }
  }

  /** 当前最值得作为夜梦目标的会话 id（取最近创建/打开的昔涟会话）。 */
  const liveCyreneSessionId = () => {
    const first = liveCyreneAgents()[0]
    return String(first?.id ?? first?.session?.id ?? '')
  }

  /** 手动触发的目标 agent：最新活会话 → lastCyreneSessionId → undefined。 */
  const pickAgent = () => {
    const agent = liveCyreneAgents()[0]
    if (agent !== undefined) return agent
    try {
      const sessionId = state.lastCyreneSessionId
      if (sessionId !== '') return ctx.get('agents')?.get?.(sessionId)
    } catch {
      /* ignore */
    }
    return undefined
  }

  /**
   * 只保留 keepSessionId 这一条夜梦任务；其余（迁移带进来的死会话、旧会话）全部删掉。
   * 同一个时间只该有一个"当前昔涟会话"的夜梦。
   */
  const pruneSchedules = async (keepSessionId = '') => {
    const svc = scheduleService()
    if (svc === null || typeof svc.delete !== 'function') return
    const entries = Object.entries(state.schedules ?? {})
    if (entries.length === 0) return
    const keep = new Set()
    if (keepSessionId !== '' && state.schedules[keepSessionId] !== undefined) keep.add(keepSessionId)
    for (const [sid, record] of entries) {
      if (keep.has(sid)) continue
      try {
        if (record?.id !== undefined && record.id !== '') await svc.delete({ sessionId: sid, id: record.id })
        logMeta('日程.log', `prune stale session=${sid} id=${record?.id ?? ''}`)
      } catch (error) {
        logMeta('日程.log', `prune failed session=${sid} ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      delete state.schedules[sid]
    }
    saveDreamState(root, state)
  }

  /** 确保某个会话有每日夜梦任务（幂等）。 */
  const ensureSchedule = async (sessionId) => {
    const sid = String(sessionId ?? '')
    if (sid === '') return
    const svc = scheduleService()
    if (svc === null) {
      logMeta('日程.log', `schedule 服务不可用（跳过 session=${sid}）`)
      return
    }
    try {
      let list = []
      if (typeof svc.list === 'function') {
        const got = await svc.list({ sessionId: sid })
        if (Array.isArray(got)) list = got
      }
      const mine = list.filter((task) => task?.title === DREAM_TITLE)
      for (const extra of mine.slice(1)) {
        try {
          if (typeof svc.delete === 'function') await svc.delete({ sessionId: sid, id: extra.id })
        } catch {
          /* ignore */
        }
      }
      const existing = mine[0]
      if (existing !== undefined) {
        const seconds = (value) => {
          const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(value ?? ''))
          return m === null ? null : Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0)
        }
        const same = existing.kind === 'daily'
          && seconds(existing.time) === seconds(cfg.dream.time)
          && existing.timeZone === cfg.dream.timeZone
        if (same) {
          state.schedules[sid] ??= { id: existing.id, createdAt: Date.now() }
          saveDreamState(root, state)
          await pruneSchedules(sid)
          return
        }
        if (typeof svc.update === 'function') {
          const result = await svc.update({
            sessionId: sid,
            id: existing.id,
            expected: existing,
            change: { kind: 'daily', daily: { time: cfg.dream.time, time_zone: cfg.dream.timeZone } },
          })
          if (result?.updated === true) {
            state.schedules[sid] = { id: existing.id, createdAt: Date.now() }
            saveDreamState(root, state)
            await pruneSchedules(sid)
            return
          }
          logMeta('日程.log', `update failed code=${result?.code ?? 'unknown'}; recreate session=${sid} id=${existing.id}`)
        }
        if (typeof svc.delete === 'function') await svc.delete({ sessionId: sid, id: existing.id })
      }
      const created = await svc.create(sid, {
        title: DREAM_TITLE,
        prompt: DREAM_TRIGGER_TEXT,
        daily: { time: cfg.dream.time, time_zone: cfg.dream.timeZone },
      })
      const id = typeof created === 'string' ? created : String(created?.id ?? created?.taskId ?? '')
      state.schedules[sid] = { id, createdAt: Date.now() }
      await pruneSchedules(sid)
      const ordered = Object.entries(state.schedules).sort((a, b) => (a[1]?.createdAt ?? 0) - (b[1]?.createdAt ?? 0))
      while (ordered.length > (cfg.dream.maxScheduledSessions ?? 3)) {
        const [oldSid, old] = ordered.shift()
        try {
          if (old?.id !== '' && typeof svc.delete === 'function') await svc.delete({ sessionId: oldSid, id: old.id })
        } catch {
          /* ignore */
        }
        delete state.schedules[oldSid]
      }
      saveDreamState(root, state)
      logMeta('日程.log', `created session=${sid} id=${id} time=${cfg.dream.time} tz=${cfg.dream.timeZone}`)
    } catch (error) {
      logMeta('日程.log', `create failed session=${sid} ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** 标记到达：校验 → 领租约 → 把完整规程注入到标记之后。 */
  const handleTrigger = (decision, messages, markerMsg, sessionId) => {
    try {
      const force = /force/i.test(textOf(markerMsg))
      if (dreamedToday(state, Date.now(), { time: cfg.dream.time, timeZone: cfg.dream.timeZone }) === true && force !== true) {
        logMeta('梦.log', `skip already-dreamed session=${sessionId}`)
        return { ...decision, messages: messages.filter((message) => message !== markerMsg) }
      }
      const lease = acquireDreamLease(state, sessionId)
      if (lease.ok !== true) {
        logMeta('梦.log', `skip busy session=${sessionId}`)
        return { ...decision, messages: messages.filter((message) => message !== markerMsg) }
      }
      saveDreamState(root, state)
      const prompt = buildDreamPrompt(root)
      const at = messages.indexOf(markerMsg)
      const out = messages.slice()
      out.splice(at + 1, 0, createPluginMessage(prompt, '一页永恒·夜梦'))
      logDream(root, `start session=${sessionId} force=${force} promptChars=${prompt.length}`)
      return { ...decision, messages: out }
    } catch (error) {
      logMeta('梦.log', `trigger error ${error instanceof Error ? error.message : String(error)}`)
      return decision
    }
  }

  /** 模型没写梦志时的自动摘要（至少留下今天的条目线索，而不是一句道歉）。 */
  const fallbackJournal = () => {
    try {
      const note = buildDayNote(root, dayOf())
      if (note !== null) return note
      return '今天没有新增记忆。'
    } catch {
      return '（自动收尾：本次整理没有写梦志，仅记录状态。请查看 元/梦.log。）'
    }
  }

  /** 收尾：日档 dreamed 标记、兜底梦志、释放租约、按需快照。 */
  const finalize = (sessionId, kind) => {
    const running = state.running
    if (running === null || String(running.sessionId) !== String(sessionId)) return
    const ok = kind === 'completed' || kind === 'forked' || kind === ''
    try {
      if (ok) markDayDreamed(root)
      const journalPath = join(root, '梦', `${dayOf()}.md`)
      if (existsSync(journalPath) === false) {
        writeDreamJournal(root, fallbackJournal())
      }
      releaseDreamLease(state, ok ? 'done' : 'failed')
      saveDreamState(root, state)
      logDream(root, `end session=${sessionId} kind=${kind || 'unknown'} ok=${ok}`)
      if (ok && cfg.backup?.enabled === true) {
        try {
          const snap = snapshotRoot(root, { keep: cfg.backup.keep, force: true })
          if (snap.ok === true) {
            state.lastSnapshotDate = dayOf()
            saveDreamState(root, state)
          }
          logMeta('维护.log', `snapshot(after-dream) ok=${snap.ok === true}`)
        } catch (error) {
          logMeta('维护.log', `snapshot(after-dream) error ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    } catch (error) {
      logMeta('梦.log', `finalize error ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 全局 pre-step：只处理昔涟预设会话；标记优先，且只认"当前会话"的标记。
  const preStep = ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    try {
      const agent = payload?.agent
      if (agent === undefined || allowed(agent) !== true) return decision
      const sessionId = String(agent?.session?.id ?? '')
      if (sessionId === '') return decision
      const messages = Array.isArray(decision?.messages) ? decision.messages : []
      const markerMsg = messages.find((message) => textOf(message).includes(DREAM_MARKER))
      if (markerMsg !== undefined) {
        // 迁移/旧日程可能把标记投到早已不用的会话；只允许当前会话触发。
        if (state.lastCyreneSessionId !== sessionId) {
          logDream(root, `skip stale session=${sessionId} last=${state.lastCyreneSessionId}`)
          return { ...decision, messages: messages.filter((message) => message !== markerMsg) }
        }
        return handleTrigger(decision, messages, markerMsg, sessionId)
      }
      if (state.lastCyreneSessionId !== sessionId) {
        state.lastCyreneSessionId = sessionId
        saveDreamState(root, state)
        void ensureSchedule(sessionId)
      }
      return decision
    } catch {
      return decision
    }
  })
  if (typeof preStep === 'function') disposers.push(preStep)

  // 轮次结束收尾。
  const onEvent = (session, event) => {
    try {
      if (event?.type !== 'turn/end') return
      const sessionId = String(session?.id ?? session?.header?.id ?? '')
      const reason = event?.data?.reason
      const kind = typeof reason === 'string' ? reason : String(reason?.kind ?? '')
      finalize(sessionId, kind)
    } catch {
      /* ignore */
    }
  }
  const sessionEvent = ctx.on('session/event', onEvent)
  if (typeof sessionEvent === 'function') disposers.push(sessionEvent)

  /** 手动触发（命令/面板用）。 */
  const triggerDream = async (agent) => {
    const target = typeof agent?.followup === 'function' ? agent : pickAgent()
    if (typeof target?.followup !== 'function') {
      logDream(root, 'trigger failed: no live cyrene agent')
      return { ok: false, error: '没有可唤醒的会话；请先在昔涟模式里说一句话。' }
    }
    try {
      const sessionId = String(target.id ?? target.session?.id ?? '')
      if (sessionId !== '' && state.lastCyreneSessionId !== sessionId) {
        state.lastCyreneSessionId = sessionId
        saveDreamState(root, state)
        void ensureSchedule(sessionId)
      }
      logDream(root, `manual trigger session=${sessionId}`)
      await target.followup(createPluginMessage(`${DREAM_MARKER} force 手动夜梦整理。`, '一页永恒·夜梦'))
      return { ok: true, message: '已启动整理（六阶段）。' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logDream(root, `trigger error session=${String(target?.id ?? '')} ${message}`)
      return { ok: false, error: `启动失败：${message}` }
    }
  }

  service.dream = {
    ensureSchedule,
    triggerDream,
    pickAgent,
    /** 状态快照（命令/doctor 用）。 */
    status() {
      return {
        enabled: true,
        time: cfg.dream.time,
        timeZone: cfg.dream.timeZone,
        dreamedToday: dreamedToday(state, Date.now(), { time: cfg.dream.time, timeZone: cfg.dream.timeZone }),
        running: state.running !== null,
        schedules: Object.keys(state.schedules ?? {}).length,
        lastSessionId: state.lastCyreneSessionId,
        lastDreamAt: state.lastDreamAt,
      }
    },
  }

  logMeta('梦.log', `dream installed time=${cfg.dream.time} tz=${cfg.dream.timeZone}`)
  // 启动时只留"活着的昔涟会话"那一条；没有活会话就全清，等用户下次说话再挂。
  void pruneSchedules(liveCyreneSessionId())
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* ignore */
      }
    }
  }
}
