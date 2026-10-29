/**
 * 命令轨道（preset 作用域）：
 *   /cyrene doctor   诊断：根目录、persona 指纹、轨道、记忆/待定、漂移、夜梦、维护/思源
 *   /memory          记忆概览：四问锚点 + 五育统计 + 配额 + 待定
 *   /dream           手动触发一次夜梦整理（六阶段）
 *
 * 只在挂了 cyrene-runtime 的两个预设里注册；标准模式不可见。
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readAnchors, renderAnchorBlock } from '../memory/anchor.js'
import { loadEntries } from '../memory/entries.js'
import { pendingCount } from '../memory/pending.mjs'
import { restoreFromSiYuan } from '../memory/restore.js'
import { quotaUsage } from '../memory/store.js'
import { openVolume, personaHash } from './volume.mjs'
import { BUDGETS, ORDERS } from './rails.mjs'

const AXES = ['德', '智', '体', '美', '劳']

/** 短会话 id（去掉 session- 前缀）。 */
function shortSessionId(value) {
  const raw = String(value ?? '')
  const core = raw.startsWith('session-') ? raw.slice(8) : raw
  return core.length > 8 ? `${core.slice(0, 8)}…` : core
}

/** 版本号（doctor 展示）。 */
const VERSION = (() => {
  try {
    const parsed = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    return typeof parsed?.version === 'string' ? parsed.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

/** 诊断日志：命令注册是否真的接上了（写进记忆根的 元/命令诊断.log）。 */
function diag(root, line) {
  try {
    if (typeof root === 'string' && root !== '') {
      appendFileSync(join(root, '元', '命令诊断.log'), `[${new Date().toISOString()}] ${line}\n`)
    }
  } catch {
    /* ignore */
  }
}

/** 当前会话的 preset id（best-effort）。 */
function presetOf(ctx, agent) {
  try {
    const composed = ctx.get('agentPresets')?.composedPreset(agent?.ctx)
    if (typeof composed === 'string' && composed !== '') return composed
  } catch {
    /* ignore */
  }
  const header = agent?.session?.header ?? {}
  if (typeof header.agentPreset === 'string') return header.agentPreset
  if (typeof header.preset === 'string') return header.preset
  return 'unknown'
}

/** 五育分布。 */
function axisCounts(entries) {
  const counts = { 德: 0, 智: 0, 体: 0, 美: 0, 劳: 0 }
  for (const entry of entries) {
    if (counts[entry.axis] !== undefined) counts[entry.axis] += 1
  }
  return counts
}

function humanBytes(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** 生成 doctor 文本。 */
export function doctorText({ ctx, service, agent, pluginVersion = '0.0.0' }) {
  const root = service?.root ?? ''
  const cfg = service?.config ?? {}
  const entries = (() => {
    try {
      return loadEntries(root).entries
    } catch {
      return []
    }
  })()
  const pending = (() => {
    try {
      return pendingCount(root)
    } catch {
      return 0
    }
  })()
  const quota = (() => {
    try {
      return quotaUsage(root)
    } catch {
      return null
    }
  })()
  const drift = service?.diagnostics?.drift
  const driftLine = drift === null || drift === undefined
    ? '未检测（agentPresets 服务未就绪）'
    : drift.ok === true
      ? '无漂移（standard/cordis 与快照一致）'
      : drift.presets
        .filter((item) => item.ok !== true)
        .map((item) => `${item.base}: 缺 ${JSON.stringify(item.missing ?? [])} 多 ${JSON.stringify(item.extra ?? [])}${item.error ? ` 错误 ${item.error}` : ''}`)
        .join('；')
  const dream = service?.dream?.status?.()
  const maintenance = service?.maintenance?.status?.()
  const sections = service?.diagnostics?.sections
  const sectionLine = (() => {
    if (sections === null || sections === undefined) {
      return '- 截面：未观测到装配（监听器未触发，或本进程还没有请求；镜像配置：' + (service?.config?.sectionMirror?.mode ?? 'auto') + '）'
    }
    const names = (sections.mirrored ?? []).map((item) => item.name).slice(0, 8).join('、') || '无'
    return `- 截面：镜像 ${(sections.mirrored ?? []).length} 段（${names}）｜跳过 ${(sections.skipped ?? []).length} 段｜共 ${sections.totalChars ?? 0} 字${sections.truncated ? '｜已截断' : ''}`
  })()
  const axes = axisCounts(entries)
  const lines = [
    '【cyrene doctor】',
    `- 插件：dsh-cyrene-philia093-0 v${pluginVersion} ｜ 模式：${presetOf(ctx, agent)} ｜ 档位：sealed`,
    `- 记忆根：${root || '(未初始化)'}`,
    `- persona 指纹：${personaHash().slice(0, 16)}`,
    `- 注入轨道：称呼 ${ORDERS.nickname} / 形态 ${ORDERS.form} / 风格 ${ORDERS.style} / 世界书 ${ORDERS.worldbook} / 能力总则 ${ORDERS.capability} / 计划桥 ${ORDERS.planBridge}`,
    `- 与预算：能力总则 ≤${BUDGETS.capability} 字；合计 ≤4000 字（超限按低优先级裁剪）`,
    `- 记忆：${entries.length} 条（德 ${axes.德}｜智 ${axes.智}｜体 ${axes.体}｜美 ${axes.美}｜劳 ${axes.劳}）｜待定 ${pending} 条`,
    quota === null ? '- 配额：不可读' : `- 配额：${humanBytes(quota.bytes)}（余页 ${humanBytes(quota.byTop?.['余页'] ?? 0)}）`,
    `- 漂移：${driftLine}`,
    sectionLine,
    dream === undefined
      ? '- 夜梦：未安装（config.dream.enabled != true）'
      : `- 夜梦：${dream.time} ${dream.timeZone} ｜ 今日已整理 ${dream.dreamedToday === true} ｜ 运行中 ${dream.running === true} ｜ 任务 ${dream.schedules}`,
    maintenance === undefined
      ? '- 维护：未安装'
      : `- 维护：每 ${cfg.backup?.intervalMinutes ?? 30} 分钟 ｜ 快照 ${cfg.backup?.enabled === true} ｜ 思源 ${maintenance.siyuan?.enabled === true}${maintenance.lastMirrorError ? `（上次失败：${maintenance.lastMirrorError}）` : ''}`,
    '- 手动：/cyrene 同步｜/cyrene 备份｜/cyrene 恢复｜/cyrene 夜梦｜/dream（立即整理）；发 /cyrene 帮助 看全部',
  ]
  return lines.join('\n')
}

/** 生成 /memory 文本。 */
export function memoryText({ service }) {
  const root = service?.root
  if (typeof root !== 'string' || root === '') return '记忆根目录未初始化。'
  const entries = loadEntries(root).entries
  const anchors = (() => {
    try {
      return renderAnchorBlock(readAnchors(root), 1200)
    } catch {
      return '（读锚点失败）'
    }
  })()
  const axes = axisCounts(entries)
  const recent = entries
    .slice()
    .sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0))
    .slice(0, 5)
    .map((entry) => `- [${entry.axis}·I${entry.I}] ${String(entry.text ?? '').slice(0, 60)}（id: ${entry.id}）`)
  return [
    '【一页永恒 · 记忆概览】',
    anchors,
    '',
    `条目：${entries.length}｜德 ${axes.德}｜智 ${axes.智}｜体 ${axes.体}｜美 ${axes.美}｜劳 ${axes.劳}｜待定 ${pendingCount(root)}`,
    recent.length > 0 ? `最近：\n${recent.join('\n')}` : '最近：无',
  ].join('\n')
}

/** /cyrene 的中文帮助。 */
export function commandHelpText() {
  return [
    '【昔涟 · 命令】',
    '/cyrene 帮助 —— 显示这份说明',
    '/cyrene 诊断（doctor） —— 体检：记忆/轨道/漂移/夜梦/备份',
    '/cyrene 同步（sync） —— 现在就把记忆同步到思源',
    '/cyrene 备份（backup） —— 现在做一份本地快照',
    '/cyrene 恢复（restore） —— 从思源找回缺失的记忆；加“强制”会覆盖锚点/梦志',
    '/cyrene 夜梦（dreams） —— 查看哪些会话开着夜梦',
    '/cyrene 开启夜梦 / 关闭夜梦 —— 切换当前会话的夜梦',
    '/cyrene 开卷 确认 <原因> —— 开新卷（记录人格边界，不改人设文本）',
    '',
    '英文名（doctor/sync/backup/restore/dreams）也能用；不确定就发 /cyrene 帮助。',
  ].join('\n')
}

/**
 * 把中英文输入归一成一个动作。
 * @returns {{ action:string, force?:boolean, reason?:string }}
 */
export function parseCyreneCommand(rawInput) {
  const text = String(rawInput ?? '').replace(/\s+/g, ' ').trim()
  const lower = text.toLowerCase()
  if (text === '' || /^(help|帮助|说明|命令|菜单)$/i.test(text)) return { action: 'help' }
  if (/^(doctor|诊断|体检|检查)$/i.test(text)) return { action: 'doctor' }
  if (/^(sync|同步|立即同步)$/i.test(text)) return { action: 'sync' }
  if (/^(backup|备份|快照|立即备份)$/i.test(text)) return { action: 'backup' }
  if (/^(restore|恢复|从思源恢复)(\s+(force|强制|强行))?$/i.test(text)) {
    return { action: 'restore', force: /(force|强制|强行)/i.test(lower) }
  }
  if (/^(dreams|夜梦|夜梦列表|夜梦会话)$/i.test(text)) return { action: 'dreams' }
  if (/^(dream on|开启夜梦|打开夜梦|开夜梦)$/i.test(text)) return { action: 'dream-on' }
  if (/^(dream off|关闭夜梦|关掉夜梦|关夜梦)$/i.test(text)) return { action: 'dream-off' }
  if (/^(new-volume|new volume|开卷|开新卷|新卷)(\s+.*)?$/i.test(text)) {
    const parts = text.split(' ')
    const at = parts.findIndex((part) => /^(confirm|确认)$/i.test(part))
    if (at < 0) return { action: 'new-volume', confirmed: false }
    return { action: 'new-volume', confirmed: true, reason: parts.slice(at + 1).join(' ').trim() || '手动开新卷' }
  }
  return { action: 'unknown' }
}

/** 三个命令的定义。 */
export function commandDefinitions(scope, service, pluginVersion = VERSION) {
  return [
    {
      name: 'cyrene',
      description: '昔涟：帮助 / 诊断 / 同步 / 备份 / 恢复 / 夜梦 / 开卷（中英文都能用）',
      input: { hint: '帮助｜诊断｜同步｜备份｜恢复｜夜梦｜开卷' },
      handler: async (invocation) => {
        const rawInput = String(invocation?.rawInput ?? '').trim()
        const parsed = parseCyreneCommand(rawInput)
        if (parsed.action === 'help') return { kind: 'success', text: commandHelpText() }
        if (parsed.action === 'doctor') {
          return { kind: 'success', text: doctorText({ ctx: scope, service, agent: invocation?.agent, pluginVersion }) }
        }
        if (parsed.action === 'sync') {
          const run = service?.maintenance?.syncNow
          if (typeof run !== 'function') return { kind: 'error', text: '维护未安装（config.backup.enabled != true）。' }
          const result = await run()
          return result.ok === true
            ? { kind: 'success', text: `已同步到思源（条目 ${result.entries ?? 0}）。` }
            : { kind: 'error', text: `同步失败：${result.error ?? '未知原因'}` }
        }
        if (parsed.action === 'backup') {
          const run = service?.maintenance?.backupNow
          if (typeof run !== 'function') return { kind: 'error', text: '维护未安装（config.backup.enabled != true）。' }
          const result = run()
          return result.ok === true
            ? { kind: 'success', text: `已备份：${result.path ?? ''}${result.skipped === true ? '（已存在，跳过）' : ''}` }
            : { kind: 'error', text: `备份失败：${result.error ?? '未知原因'}` }
        }
        if (parsed.action === 'dreams') {
          const list = service?.dream?.listSessions?.() ?? []
          if (list.length === 0) return { kind: 'success', text: '还没有登记过昔涟会话；在会话里说一句话后就会出现在这里。' }
          const lines = ['夜梦会话：']
          for (const item of list) {
            lines.push(`- ${item.live ? '●' : '○'} ${item.shortId}｜${item.enabled ? '启用' : '关闭'}${item.scheduled ? '｜已排程' : ''}${item.lastUserText ? `｜${String(item.lastUserText).slice(0, 30)}` : ''}`)
          }
          return { kind: 'success', text: lines.join('\n') }
        }
        if (parsed.action === 'dream-on' || parsed.action === 'dream-off') {
          const on = parsed.action === 'dream-on'
          const agent = invocation?.agent
          const sessionId = String(agent?.session?.id ?? agent?.id ?? '')
          if (sessionId === '') return { kind: 'error', text: '拿不到当前会话 id。' }
          const result = service?.dream?.setSessionEnabled?.(sessionId, on) ?? { ok: false, error: '夜梦未安装' }
          return result.ok === true
            ? { kind: 'success', text: `当前会话（${sessionId.slice(0, 8)}…）夜梦已${on ? '开启' : '关闭'}；明日 23:30 ${on ? '会' : '不会'}自动整理。` }
            : { kind: 'error', text: result.error ?? '操作失败' }
        }
        if (parsed.action === 'new-volume') {
          if (parsed.confirmed !== true) {
            return {
              kind: 'error',
              text: '开新卷会记录人格边界，是重要操作。\n确认真要开时用：/cyrene 开卷 确认 <原因>\n（也可以写 /cyrene new-volume confirm <原因>）',
            }
          }
          const reason = parsed.reason ?? '手动开新卷'
          const result = openVolume(service.root, { reason })
          return result.ok === true
            ? {
              kind: 'success',
              text: `已开卷 #${result.id}（${reason}）。persona 指纹 ${result.hash.slice(0, 12)}…，快照在 ${result.snapshot}。\n`
                + '注意：开卷只记录边界；要改人设文本，仍需编辑 persona/ 后 npm run build 并重启 DSH。',
            }
            : { kind: 'error', text: `开卷失败：${result.error ?? '未知原因'}` }
        }
        if (parsed.action === 'restore') {
          const cfg = service?.config?.siyuan
          if (cfg === undefined || cfg === null) return { kind: 'error', text: '思源配置不可用。' }
          const report = await restoreFromSiYuan(cfg, service.root, { force: parsed.force === true })
          const lines = [
            `思源恢复：${report.ok === true ? '完成' : '有错误'}`,
            `- 扫描：日档 ${report.docs?.days ?? 0}｜锚点 ${report.docs?.anchors ?? 0}｜梦志 ${report.docs?.journals ?? 0}`,
            `- 条目新增 ${report.entries?.added ?? 0}｜跳过 ${report.entries?.skipped ?? 0}｜锚点 ${report.anchors?.restored ?? 0}｜梦志 ${report.journals?.restored ?? 0}`,
            ...(report.errors ?? []).map((error) => `- 错误：${error}`),
          ]
          return report.ok === true
            ? { kind: 'success', text: lines.join('\n') }
            : { kind: 'error', text: lines.join('\n') }
        }
        return {
          kind: 'error',
          text: `没看懂「${rawInput || '（空）'}」。\n\n${commandHelpText()}`,
        }
      },
    },
    {
      name: 'memory',
      description: '一页永恒记忆概览：四问锚点 + 五育统计 + 待定 + 最近条目',
      input: { hint: '' },
      handler: () => ({ kind: 'success', text: memoryText({ service }) }),
    },
    {
      name: 'dream',
      description: '手动触发一次夜梦整理（六阶段）',
      input: { hint: '(可选：强制)' },
      handler: async (invocation) => {
        const trigger = service?.dream?.triggerDream
        if (typeof trigger !== 'function') return { kind: 'error', text: '夜梦调度未安装（config.dream.enabled != true）。' }
        const result = await trigger(invocation?.agent)
        return result.ok === true
          ? { kind: 'success', text: result.message ?? '已启动整理。' }
          : { kind: 'error', text: result.error ?? '启动失败。' }
      },
    },
  ]
}

/** 在已有 commands 服务的 scope 上直接注册（不嵌套 inject）。 */
export function registerCommands(scope, service, pluginVersion = VERSION) {
  const root = service?.root
  const targets = commandDefinitions(scope, service, pluginVersion)
  if (typeof scope?.commands?.register !== 'function') {
    diag(root, `skip: commands service unavailable (ctx=${Object.keys(scope ?? {}).slice(0, 12).join(',')})`)
    return []
  }
  const disposers = []
  for (const definition of targets) {
    try {
      const dispose = scope.commands.register(definition)
      disposers.push(dispose)
      diag(root, `registered ${definition.name}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      diag(root, `register failed ${definition.name}: ${message}`)
      scope?.logger?.warn?.(`[cyrene-commands] 注册 ${definition.name} 失败：${message}`)
    }
  }
  return disposers
}

/**
 * 兼容旧入口（嵌套 inject 路径；测试与早期调用）。
 * @returns disposer
 */
export function installCommands(ctx, service, pluginVersion = VERSION) {
  let disposers = []
  try {
    ctx.inject(['commands'], (scope) => {
      disposers = registerCommands(scope, service, pluginVersion)
    })
  } catch (error) {
    diag(service?.root, `install failed: ${error instanceof Error ? error.message : String(error)}`)
  }
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

/**
 * 预设行插件入口：作为独立行挂载（与 plan-mode 同一种组合方式）。
 * 行配置无需参数；依赖 commands + cyreneMemory 由行声明注入。
 */
export const inject = ['commands', 'cyreneMemory']
export const name = 'cyrene-commands'

export function apply(ctx) {
  const service = ctx.cyreneMemory
  diag(service?.root, `apply: commands=${typeof ctx.commands?.register}`)
  registerCommands(ctx, service, VERSION)
}
