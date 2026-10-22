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
import { personaHash } from './volume.mjs'
import { BUDGETS, ORDERS } from './rails.mjs'

const AXES = ['德', '智', '体', '美', '劳']

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
    '- 手动：/cyrene sync（同步）｜/cyrene backup（备份）｜/cyrene restore（从思源恢复）｜/dream（立即整理）',
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

/** 三个命令的定义。 */
export function commandDefinitions(scope, service, pluginVersion = VERSION) {
  return [
    {
      name: 'cyrene',
      description: 'cyrene doctor｜sync｜backup｜restore｜dreams｜dream on/off：诊断/同步/备份/恢复/夜梦会话',
      input: { hint: '(doctor|sync|backup|restore [force]|dreams|dream on|dream off)' },
      handler: async (invocation) => {
        const rawInput = String(invocation?.rawInput ?? '').trim()
        const sub = rawInput.toLowerCase()
        if (sub === '' || sub === 'doctor') {
          return { kind: 'success', text: doctorText({ ctx: scope, service, agent: invocation?.agent, pluginVersion }) }
        }
        if (sub === 'sync') {
          const run = service?.maintenance?.syncNow
          if (typeof run !== 'function') return { kind: 'error', text: '维护未安装（config.backup.enabled != true）。' }
          const result = await run()
          return result.ok === true
            ? { kind: 'success', text: `已同步到思源（条目 ${result.entries ?? 0}）。` }
            : { kind: 'error', text: `同步失败：${result.error ?? '未知原因'}` }
        }
        if (sub === 'backup') {
          const run = service?.maintenance?.backupNow
          if (typeof run !== 'function') return { kind: 'error', text: '维护未安装（config.backup.enabled != true）。' }
          const result = run()
          return result.ok === true
            ? { kind: 'success', text: `已备份：${result.path ?? ''}${result.skipped === true ? '（已存在，跳过）' : ''}` }
            : { kind: 'error', text: `备份失败：${result.error ?? '未知原因'}` }
        }
        if (sub === 'dreams') {
          const list = service?.dream?.listSessions?.() ?? []
          if (list.length === 0) return { kind: 'success', text: '还没有登记过昔涟会话；在会话里说一句话后就会出现在这里。' }
          const lines = ['夜梦会话：']
          for (const item of list) {
            lines.push(`- ${item.live ? '●' : '○'} ${item.shortId}｜${item.enabled ? '启用' : '关闭'}${item.scheduled ? '｜已排程' : ''}${item.lastUserText ? `｜${String(item.lastUserText).slice(0, 30)}` : ''}`)
          }
          return { kind: 'success', text: lines.join('\n') }
        }
        if (sub === 'dream on' || sub === 'dream off') {
          const agent = invocation?.agent
          const sessionId = String(agent?.session?.id ?? agent?.id ?? '')
          if (sessionId === '') return { kind: 'error', text: '拿不到当前会话 id。' }
          const result = service?.dream?.setSessionEnabled?.(sessionId, sub === 'dream on') ?? { ok: false, error: '夜梦未安装' }
          return result.ok === true
            ? { kind: 'success', text: `当前会话（${sessionId.slice(0, 8)}…）夜梦已${sub === 'dream on' ? '开启' : '关闭'}；明日 23:30 ${sub === 'dream on' ? '会' : '不会'}自动整理。` }
            : { kind: 'error', text: result.error ?? '操作失败' }
        }
        if (sub === 'restore' || sub === 'restore force') {
          const cfg = service?.config?.siyuan
          if (cfg === undefined || cfg === null) return { kind: 'error', text: '思源配置不可用。' }
          const report = await restoreFromSiYuan(cfg, service.root, { force: sub.endsWith('force') })
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
        return { kind: 'error', text: '用法：/cyrene doctor｜sync｜backup｜restore [force]｜dreams｜dream on/off' }
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
      input: { hint: '(force)' },
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
