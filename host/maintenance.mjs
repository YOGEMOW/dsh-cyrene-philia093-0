/**
 * 定时维护（宿主管家）：思源镜像 + 每日快照 + 月度体检/日历滚动。
 *
 * 默认开（与一页永恒一致）：
 *   - 思源镜像：每 `backup.intervalMinutes`（默认 30）同步一次；本地是真相，思源是副本；
 *   - 每日快照：`backup.snapshotHour` 之后第一次 tick 做一次，保留 `backup.keep` 份；
 *   - 月度体检/月年滚动：同一 tick 内幂等执行。
 *
 * 全部 fail-open：任何外部依赖失败只写 `元/维护.log` 或 `元/思源镜像.log`，不影响会话。
 */
import { appendFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { loadEntries } from '../memory/entries.js'
import { collectAnchorSourceBlocks, compactAllAnchors, readAnchors } from '../memory/anchor.js'
import { summarizeAnchorBlocks } from './anchor-summary.mjs'
import { monthlyAudit } from '../memory/audit.js'
import { rollCalendars } from '../memory/rolling.js'
import { runWatchdog } from '../memory/watchdog.js'
import { snapshotRoot } from '../memory/backup.js'
import { loadDreamState, saveDreamState } from '../memory/dream.js'
import {
  logMirror,
  loadMirrorState,
  resolveSiYuanConfig,
  syncAnchorHistory,
  syncAnchors,
  syncArchives,
  syncDayShells,
  syncEntries,
  syncFreeArea,
  syncJournal,
} from '../memory/siyuan.js'
import { listDays, readTextSafe } from '../memory/store.js'
import { absPath, DREAM_ROOT, MONTH_ROOT, YEAR_ROOT } from '../memory/paths.js'

const DEFAULT_INTERVAL_MINUTES = 30
const ENTRY_SYNC_DAYS = 3
const JOURNAL_SYNC_DAYS = 7

function dayOf(now = Date.now()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 安装定时维护。
 * @param ctx 宿主上下文
 * @param service cyreneMemory 服务
 * @param rawSiyuan 行配置里的 siyuan 段
 * @returns disposer
 */
export function installMaintenance(ctx, service, rawSiyuan) {
  const root = service?.root
  const cfg = service?.config
  if (typeof root !== 'string' || root === '') return () => {}
  const siyuan = resolveSiYuanConfig(service?.config?.siyuan ?? rawSiyuan)
  const disposers = []
  const metaLog = (file, line) => {
    try {
      appendFileSync(join(root, '元', file), `[${new Date().toISOString()}] ${line}\n`)
    } catch {
      /* ignore */
    }
  }

  let lastMirrorAt = 0
  let lastMirrorError = ''
  let lastWatchdog = null

  /** 本地所有月响/年轮（供思源镜像）。 */
  const listArchiveDocs = () => {
    const items = []
    try {
      const monthRoot = absPath(root, MONTH_ROOT)
      for (const year of readdirSync(monthRoot)) {
        const dir = join(monthRoot, year)
        for (const name of readdirSync(dir)) {
          if (!/^\d{4}-\d{2}\.md$/.test(name)) continue
          const text = readTextSafe(join(dir, name))
          if (text.trim() !== '') items.push({ kind: 'month', id: name.replace(/\.md$/, ''), text })
        }
      }
    } catch {
      /* 月响目录不存在 */
    }
    try {
      const yearRoot = absPath(root, YEAR_ROOT)
      for (const name of readdirSync(yearRoot)) {
        if (!/^\d{4}\.md$/.test(name)) continue
        const text = readTextSafe(join(yearRoot, name))
        if (text.trim() !== '') items.push({ kind: 'year', id: name.replace(/\.md$/, ''), text })
      }
    } catch {
      /* 年轮目录不存在 */
    }
    return items
  }

  /** 本地梦境文件（按年月日分级）。 */
  const listDreamDocs = () => {
    const items = []
    try {
      const dreamRoot = absPath(root, DREAM_ROOT)
      for (const year of readdirSync(dreamRoot)) {
        const yearDir = join(dreamRoot, year)
        for (const month of readdirSync(yearDir)) {
          const monthDir = join(yearDir, month)
          for (const name of readdirSync(monthDir)) {
            if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) continue
            items.push({ day: name.replace(/\.md$/, ''), path: join(monthDir, name) })
          }
        }
      }
    } catch {
      /* 梦境目录不存在 */
    }
    return items.sort((a, b) => a.day.localeCompare(b.day))
  }

  /** 思源镜像：锚点 + 近 3 天条目 + 近 7 天梦志 + 余页。 */
  const runMirrorOnce = async () => {
    if (siyuan.enabled !== true) return { ok: true, skipped: true }
    try {
      const entries = loadEntries(root).entries.filter((entry) => entry?.sync !== false)
      const recent = entries.filter((entry) => {
        if (typeof entry?.day !== 'string') return false
        const cut = new Date(Date.now() - ENTRY_SYNC_DAYS * 86400000).toISOString().slice(0, 10)
        return entry.day >= cut
      })
      if (recent.length > 0) await syncEntries(siyuan, root, recent)
      try {
        await syncDayShells(siyuan, root, listDays(root))
      } catch {
        /* 空日壳失败不阻塞 */
      }
      const anchors = readAnchors(root)
      if (anchors !== undefined) await syncAnchors(siyuan, root, anchors)
      try {
        await syncAnchorHistory(siyuan, root)
      } catch {
        /* 锚点历史镜像失败不阻塞 */
      }
      try {
        const docs = listDreamDocs().slice(-JOURNAL_SYNC_DAYS)
        for (const item of docs) {
          const text = readTextSafe(item.path)
          if (text.trim() !== '') await syncJournal(siyuan, root, item.day, text)
        }
      } catch {
        /* 梦境目录不存在/读失败忽略 */
      }
      try {
        await syncFreeArea(siyuan, root)
      } catch {
        /* 余页镜像失败不阻塞 */
      }
      let archives = 0
      try {
        const docs = listArchiveDocs()
        if (docs.length > 0) {
          const result = await syncArchives(siyuan, root, docs)
          archives = result.synced
          if (result.ok !== true) logMirror(root, `archives warn ${(result.errors ?? []).join('；')}`)
        }
      } catch {
        /* 月/年档镜像失败不阻塞 */
      }
      lastMirrorAt = Date.now()
      lastMirrorError = ''
      logMirror(root, `tick ok entries=${recent.length} archives=${archives} anchors=1`)
      return { ok: true, entries: recent.length, archives }
    } catch (error) {
      lastMirrorError = error instanceof Error ? error.message : String(error)
      logMirror(root, `tick failed ${lastMirrorError}`)
      return { ok: false, error: lastMirrorError }
    }
  }

  // 合并并发镜像请求：debounced flush 与 30 分钟 tick 可能同时到达，避免状态互相覆盖。
  let mirrorPending = null
  const runMirror = () => {
    if (mirrorPending !== null) return mirrorPending
    const pending = runMirrorOnce().finally(() => {
      if (mirrorPending === pending) mirrorPending = null
    })
    mirrorPending = pending
    return pending
  }

  /** 每日快照 + 骨架维护；force=true 时忽略时点与"今天已备"限制（面板/命令手动触发）。 */
  const runBackup = (options = {}) => {
    if (cfg?.backup?.enabled !== true) return { ok: true, skipped: true }
    const force = options.force === true
    try {
      const hour = new Date().getHours()
      const state = loadDreamState(root)
      const today = dayOf()
      const due = force === true || (hour >= (cfg.backup.snapshotHour ?? 3) && state.lastSnapshotDate !== today)
      if (due) {
        const snap = snapshotRoot(root, { keep: cfg.backup.keep ?? 7, force })
        if (snap.ok === true) {
          state.lastSnapshotDate = today
          saveDreamState(root, state)
          metaLog('维护.log', `snapshot ok path=${snap.path} skipped=${snap.skipped === true} force=${force}`)
          return { ok: true, path: snap.path, skipped: snap.skipped === true }
        }
        metaLog('维护.log', `snapshot failed ${snap.error}`)
        return { ok: false, error: snap.error }
      }
      return { ok: true, skipped: true }
    } catch (error) {
      metaLog('维护.log', `snapshot error ${error instanceof Error ? error.message : String(error)}`)
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** 手动立即同步思源（面板/命令用）。 */
  const syncNow = async () => {
    const result = await runMirror()
    metaLog('维护.log', `manual sync ok=${result.ok === true}${result.error ? ` ${result.error}` : ''}`)
    return result
  }

  /** 手动立即快照。 */
  const backupNow = () => {
    const result = runBackup({ force: true })
    metaLog('维护.log', `manual backup ok=${result.ok === true}${result.error ? ` ${result.error}` : ''}`)
    return result
  }

  /** 一起跑：镜像 + 快照 + 月度体检/滚动。 */
  const runOnce = async (reason = 'tick') => {
    const started = Date.now()
    const mirror = await runMirror()
    const backup = runBackup()
    let monthly = null
    let rolling = null
    try {
      const entries = loadEntries(root).entries
      monthly = monthlyAudit(root, entries)
      rolling = rollCalendars(root, entries)
    } catch (error) {
      metaLog('维护.log', `audit/roll failed ${error instanceof Error ? error.message : String(error)}`)
    }
    try {
      const blocks = []
      for (const key of ['self', 'user', 'origin', 'goal']) blocks.push(...collectAnchorSourceBlocks(root, key))
      const summaries = await summarizeAnchorBlocks(ctx, root, blocks)
      const anchors = compactAllAnchors(root, { summaries, limits: cfg?.anchor })
      for (const [key, item] of Object.entries(anchors)) {
        if (item?.compacted === true) metaLog('锚点.log', `compact ${key} ${item.before}->${item.after}`)
      }
    } catch (error) {
      metaLog('锚点.log', `compact failed ${error instanceof Error ? error.message : String(error)}`)
    }
    let watchdog = null
    try {
      watchdog = runWatchdog(root)
      lastWatchdog = watchdog
      if (watchdog.ok !== true) {
        const failed = watchdog.checks.filter((check) => check.ok !== true).map((check) => check.name).join('；')
        metaLog('看门狗.log', `warn ${failed}`)
      }
    } catch (error) {
      metaLog('看门狗.log', `failed ${error instanceof Error ? error.message : String(error)}`)
    }
    metaLog('维护.log', `tick reason=${reason} mirror=${mirror.ok === true} backup=${backup.ok === true} ${Date.now() - started}ms`)
    return { mirror, backup, monthly, rolling, watchdog }
  }

  /** 写后实时同步：防抖合并，最多等 `debounceMs`（默认 1500ms）。 */
  let flushTimer = null
  let flushPending = null
  const flushSoon = (reason = 'write') => {
    if (siyuan.enabled !== true) return Promise.resolve({ ok: true, skipped: true })
    if (flushPending !== null) return flushPending
    const debounceMs = Math.max(200, Number(cfg?.backup?.mirrorDebounceMs) || 1500)
    flushPending = new Promise((resolve) => {
      flushTimer = setTimeout(async () => {
        flushTimer = null
        try {
          const result = await runMirror()
          logMirror(root, `debounced flush(${reason}) ok=${result.ok === true} entries=${result.entries ?? 0}`)
          resolve(result)
        } catch (error) {
          resolve({ ok: false, error: error instanceof Error ? error.message : String(error) })
        } finally {
          flushPending = null
        }
      }, debounceMs)
      flushTimer.unref?.()
    })
    return flushPending
  }

  // 回合结束 / 工具结果后立即触发一次防抖同步（记忆/梦志/锚点写入后就能到思源）。
  if (typeof ctx?.on === 'function') {
    const off = ctx.on('session/event', (_session, event) => {
      try {
        if (event?.type === 'turn/end' || event?.type === 'tool/result') void flushSoon(event.type)
      } catch {
        /* ignore */
      }
    })
    if (typeof off === 'function') disposers.push(off)
  }

  service.maintenance = {
    runOnce,
    runMirror,
    runBackup,
    syncNow,
    backupNow,
    flushSoon,
    status() {
      return {
        siyuan: {
          enabled: siyuan.enabled === true,
          baseURL: siyuan.baseURL,
          notebook: siyuan.notebook,
          rootHPath: siyuan.rootHPath,
          tokenEnv: siyuan.tokenEnv,
        },
        backup: { enabled: cfg?.backup?.enabled === true, snapshotHour: cfg?.backup?.snapshotHour, keep: cfg?.backup?.keep, intervalMinutes: cfg?.backup?.intervalMinutes },
        lastMirrorAt,
        lastMirrorError,
        watchdog: lastWatchdog,
      }
    },
  }

  // 启动 60 秒后先跑一次，随后按配置间隔轮询。
  const intervalMinutes = Math.max(1, Number(cfg?.backup?.intervalMinutes) || DEFAULT_INTERVAL_MINUTES)
  const boot = setTimeout(() => {
    void runOnce('boot')
  }, 60_000)
  const timer = setInterval(() => {
    void runOnce('tick')
  }, intervalMinutes * 60_000)
  // 后台定时器不阻止进程退出（测试/宿主关闭时友好）。
  boot.unref?.()
  timer.unref?.()
  disposers.push(() => clearTimeout(boot), () => clearInterval(timer))

  metaLog('维护.log', `maintenance installed interval=${intervalMinutes}min siyuan=${siyuan.enabled === true}`)
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
