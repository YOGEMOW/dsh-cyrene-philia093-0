/**
 * 配置解析：把 Loader 行 config 合并进默认值，并做温和的类型归一。
 *
 * 原则：配置坏掉不能让插件失效——所有异常都回落到默认值（注入链路必须 fail-open）。
 */

/** 出厂默认值（与 cordis.patch.yml 保持同义）。 */
export const DEFAULTS = {
  /** 总开关。 */
  enabled: true,
  /** 记忆根目录；空 = <DSH_HOME>/cyrene-philia093-0。 */
  rootDir: '',
  /** 是否注入（只对 injectPresets 里的预设会话生效）。 */
  injectEnabled: true,
  /** 允许注入的 agentPreset id；空数组 = 所有会话都不注入（工具仍可用）。 */
  injectPresets: ['chat', 'cyrene-work'],
  /** 逃生开关：true 时忽略预设判断，所有会话都注入（仅调试用）。 */
  injectAll: false,
  /** 每条用户消息最多注入几条「相关」记忆。 */
  hitTopK: 2,
  /** 一次取用的字符预算（不含锚点）。 */
  recallBudget: 1000,
  /** 根目录配额（MB）。 */
  quotaMB: 128,
  /** 余页子配额（MB）：AI 自由写入区的上限，≤ quotaMB。 */
  freeQuotaMB: 64,
  /** 软告警比例。 */
  softWarnRatio: 0.8,
  /** 只有用户明确陈述才写 user 类记忆（Phase 0 预留）。 */
  deductConfirmed: false,
  /** 语言（Phase 0 只有 zh 文案）。 */
  lang: 'zh',
  /** 夜梦：每天定时唤起一个会话整理记忆。 */
  dream: {
    enabled: true,
    time: '23:30:00',
    timeZone: 'Asia/Shanghai',
    maxScheduledSessions: 3
  },
  /** 定时维护：镜像同步 + 每日快照备份。 */
  backup: {
    enabled: true,
    intervalMinutes: 30,
    snapshotHour: 3,
    keep: 7
  }
}

/** 数字归一：非有限值/越界回落默认。 */
function num(value, fallback, min, max) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** 布尔归一。 */
function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

/** 字符串数组归一。 */
function strList(value, fallback) {
  if (!Array.isArray(value)) return fallback.slice()
  const out = value.filter((v) => typeof v === 'string' && v.trim() !== '').map((v) => v.trim())
  return out.length === 0 ? [] : out
}

/** HH:MM 或 HH:MM:SS → HH:MM:SS（不合法回落默认）。 */
function timeOf(value, fallback) {
  if (typeof value !== 'string') return fallback
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim())
  if (m === null) return fallback
  const h = Math.min(23, Math.max(0, Number(m[1])))
  const min = Math.min(59, Math.max(0, Number(m[2])))
  const sec = m[3] === undefined ? 0 : Math.min(59, Math.max(0, Number(m[3])))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * 解析插件配置。
 * @param raw - Loader 传入的行配置（可为 undefined）。
 * @returns 完整配置对象。
 */
export function resolveConfig(raw) {
  const c = raw !== null && typeof raw === 'object' ? raw : {}
  const d = c.dream !== null && typeof c.dream === 'object' ? c.dream : {}
  const b = c.backup !== null && typeof c.backup === 'object' ? c.backup : {}
  return {
    enabled: bool(c.enabled, DEFAULTS.enabled),
    rootDir: typeof c.rootDir === 'string' ? c.rootDir.trim() : DEFAULTS.rootDir,
    injectEnabled: bool(c.injectEnabled, DEFAULTS.injectEnabled),
    injectPresets: strList(c.injectPresets, DEFAULTS.injectPresets),
    injectAll: bool(c.injectAll, DEFAULTS.injectAll),
    hitTopK: Math.round(num(c.hitTopK, DEFAULTS.hitTopK, 0, 5)),
    recallBudget: Math.round(num(c.recallBudget, DEFAULTS.recallBudget, 200, 2000)),
    quotaMB: Math.round(num(c.quotaMB, DEFAULTS.quotaMB, 8, 4096)),
    freeQuotaMB: Math.round(num(c.freeQuotaMB, DEFAULTS.freeQuotaMB, 1, 4096)),
    softWarnRatio: num(c.softWarnRatio, DEFAULTS.softWarnRatio, 0.5, 0.99),
    deductConfirmed: bool(c.deductConfirmed, DEFAULTS.deductConfirmed),
    lang: typeof c.lang === 'string' && c.lang.trim() !== '' ? c.lang.trim() : DEFAULTS.lang,
    dream: {
      enabled: bool(d.enabled, DEFAULTS.dream.enabled),
      time: timeOf(d.time, DEFAULTS.dream.time),
      timeZone: typeof d.timeZone === 'string' && d.timeZone.trim() !== '' ? d.timeZone.trim() : DEFAULTS.dream.timeZone,
      maxScheduledSessions: Math.round(num(d.maxScheduledSessions, DEFAULTS.dream.maxScheduledSessions, 1, 8))
    },
    backup: {
      enabled: bool(b.enabled, DEFAULTS.backup.enabled),
      intervalMinutes: Math.round(num(b.intervalMinutes, DEFAULTS.backup.intervalMinutes, 1, 1440)),
      snapshotHour: Math.round(num(b.snapshotHour, DEFAULTS.backup.snapshotHour, 0, 23)),
      keep: Math.round(num(b.keep, DEFAULTS.backup.keep, 1, 60))
    }
  }
}
