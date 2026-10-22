/**
 * 审计与节律（Phase 2）：
 *  - 注入利用率：记录每次注入的条目/关键词，后续用户话里再次出现 → 记「用上了」；
 *    连续偏低（<0.3）时建议收缩命中额度（设计 §8.7）。
 *  - 月度五育体检：月初第一次维护时，对上一个月做确定性统计，追加到年轮（设计 §6.5）。
 *  - 锚点更新限额：self/user/goal ≤1 次/日、origin ≤1 次/周（设计 §11.4）。
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite, readJSON, readTextSafe } from './store.js'

/** 审计文件路径。 */
export function auditPath(root) {
  return join(root, '元', '审计.json')
}

/** 读审计状态。 */
export function loadAudit(root) {
  const raw = readJSON(auditPath(root), null)
  const base = {
    injections: [],
    stats: { total: 0, used: 0, rate: 0, updatedAt: 0 },
    effectiveTopK: null,
    anchorChanges: {},
    monthly: {}
  }
  if (raw === null || typeof raw !== 'object') return base
  return {
    injections: Array.isArray(raw.injections) ? raw.injections.slice(-200) : [],
    stats: raw.stats !== null && typeof raw.stats === 'object' ? raw.stats : base.stats,
    effectiveTopK: typeof raw.effectiveTopK === 'number' ? raw.effectiveTopK : null,
    anchorChanges: raw.anchorChanges !== null && typeof raw.anchorChanges === 'object' ? raw.anchorChanges : {},
    monthly: raw.monthly !== null && typeof raw.monthly === 'object' ? raw.monthly : {}
  }
}

/** 写审计状态。 */
export function saveAudit(root, audit) {
  try {
    atomicWrite(auditPath(root), `${JSON.stringify(audit, null, 2)}\n`)
  } catch {
    /* ignore */
  }
}

/** 记一次注入（ids + 关键词）。 */
export function noteInjection(root, { ids = [], kws = [], now = Date.now() } = {}) {
  if (!Array.isArray(ids) || ids.length === 0) return
  const audit = loadAudit(root)
  audit.injections.push({ ts: now, ids: ids.slice(0, 10), kws: kws.slice(0, 20), used: false })
  if (audit.injections.length > 200) audit.injections = audit.injections.slice(-200)
  saveAudit(root, audit)
}

/** 用户说话后：把最近 72h 内注入、且关键词再次出现的那次标为「用上了」。 */
export function noteUserTurn(root, text, now = Date.now()) {
  const body = String(text ?? '')
  if (body.trim() === '') return { used: 0 }
  const audit = loadAudit(root)
  let changed = 0
  for (const rec of audit.injections) {
    if (rec.used === true) continue
    if (now - Number(rec.ts) > 72 * 60 * 60 * 1000) continue
    const kws = Array.isArray(rec.kws) ? rec.kws : []
    if (kws.some((kw) => typeof kw === 'string' && kw.length >= 2 && body.includes(kw))) {
      rec.used = true
      changed += 1
    }
  }
  if (changed > 0) {
    const recent = audit.injections.filter((r) => now - Number(r.ts) <= 7 * 24 * 60 * 60 * 1000)
    const total = recent.length
    const used = recent.filter((r) => r.used === true).length
    audit.stats = { total, used, rate: total === 0 ? 0 : used / total, updatedAt: now }
    // 连续偏低才收缩：样本 ≥20 且利用率 <0.3
    if (total >= 20 && audit.stats.rate < 0.3) {
      audit.effectiveTopK = Math.max(1, (audit.effectiveTopK ?? 1) - 1)
    }
    saveAudit(root, audit)
  }
  return { used: changed }
}

/** 供注入层读取的命中额度（受审计自动收缩影响）。 */
export function effectiveHitTopK(root, configured) {
  const audit = loadAudit(root)
  const cap = typeof audit.effectiveTopK === 'number' ? audit.effectiveTopK : configured
  return Math.max(1, Math.min(configured, cap))
}

/** 上一个月 YYYY-MM。 */
function prevMonth(now) {
  const d = new Date(now)
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * 月度五育体检：对上一个自然月做统计，追加到 `年/YYYY.md`。
 * 纯确定性，不调 LLM。每月只做一次（审计文件记 lastMonth）。
 */
export function monthlyAudit(root, entries, now = Date.now()) {
  const month = prevMonth(now)
  const audit = loadAudit(root)
  if (audit.monthly.lastMonth === month) return { ok: true, skipped: true, month }
  const rows = (entries ?? []).filter((e) => typeof e?.day === 'string' && e.day.startsWith(month))
  if (rows.length === 0) {
    audit.monthly.lastMonth = month
    saveAudit(root, audit)
    return { ok: true, empty: true, month }
  }
  const axes = { 德: 0, 智: 0, 体: 0, 美: 0, 劳: 0 }
  let noQuote = 0
  let links = 0
  let archived = 0
  for (const e of rows) {
    if (axes[e.axis] !== undefined) axes[e.axis] += 1
    if (typeof e.src_quote !== 'string' || e.src_quote.trim() === '') noQuote += 1
    links += Array.isArray(e.links) ? e.links.length : 0
    if (e.status === 'archived') archived += 1
  }
  const density = rows.length === 0 ? 0 : links / rows.length
  const year = month.slice(0, 4)
  const file = join(root, '年', `${year}.md`)
  const prev = existsSync(file) ? readTextSafe(file) : ''
  const block = [
    '',
    `## 五育体检 ${month}`,
    `- 条目：${rows.length}（归档 ${archived}）｜联结密度 ${density.toFixed(2)}｜无原话 ${noQuote} 条`,
    `- 德 ${axes.德}｜智 ${axes.智}｜体 ${axes.体}｜美 ${axes.美}｜劳 ${axes.劳}`,
    `- 提示：${noQuote > rows.length * 0.5 ? '出处偏少，下月遇到判断/选择先记原话。' : '出处覆盖尚可。'}`,
    ''
  ].join('\n')
  const next = prev.trim() === ''
    ? `---\nyear: ${year}\n---\n\n# ${year} · 年轮\n${block}`
    : `${prev.replace(/\s*$/, '')}\n${block}`
  const ok = atomicWrite(file, next)
  if (ok === true) {
    audit.monthly.lastMonth = month
    audit.monthly[month] = { rows: rows.length, density, axes, noQuote, archived, at: now }
    saveAudit(root, audit)
  }
  return { ok, month, rows: rows.length }
}

/** 锚点限额窗口（origin 用滑动 7 天；其余按目标时区的自然日）。 */
const ANCHOR_LIMITS = {
  self: 24 * 60 * 60 * 1000,
  user: 24 * 60 * 60 * 1000,
  goal: 24 * 60 * 60 * 1000,
  origin: 7 * 24 * 60 * 60 * 1000
}

/** 目标时区的日期键 YYYY-MM-DD（用于「每天一次」的节律，而不是滚动 24 小时）。 */
function zonedDayKey(ts, timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(Number(ts))).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
    )
    return `${parts.year}-${parts.month}-${parts.day}`
  } catch {
    return new Date(Number(ts)).toISOString().slice(0, 10)
  }
}

/**
 * 检查锚点能否更新（超限返回 reason）。
 * self/user/goal 按目标时区的自然日计（每天 1 次）；origin 按滑动 7 天。
 * 用自然日而不是滚动 24 小时，避免「23:30 夜梦 + 次日 23:30 只隔 23h55m」被误判为同日。
 */
export function anchorChangeAllowed(root, key, now = Date.now(), options = {}) {
  const window = ANCHOR_LIMITS[key]
  if (window === undefined) return { ok: true }
  const audit = loadAudit(root)
  const list = Array.isArray(audit.anchorChanges[key]) ? audit.anchorChanges[key] : []
  if (key === 'origin') {
    const recent = list.filter((ts) => now - Number(ts) < window)
    if (recent.length > 0) {
      return { ok: false, reason: `「origin」锚点每 7 天最多改 1 次；最近一次在 ${new Date(Number(recent[0])).toLocaleString()}。` }
    }
    return { ok: true }
  }
  const timeZone = typeof options.timeZone === 'string' && options.timeZone.trim() !== '' ? options.timeZone.trim() : 'Asia/Shanghai'
  const today = zonedDayKey(now, timeZone)
  const sameDay = list.filter((ts) => zonedDayKey(Number(ts), timeZone) === today)
  if (sameDay.length > 0) {
    return {
      ok: false,
      reason: `「${key}」锚点每天最多改 1 次（按 ${timeZone} 的日期）；最近一次在 ${new Date(Number(sameDay[0])).toLocaleString()}。`
    }
  }
  return { ok: true }
}

/** 记录一次锚点变更（成功后调用）。 */
export function recordAnchorChange(root, key, now = Date.now()) {
  const audit = loadAudit(root)
  const list = Array.isArray(audit.anchorChanges[key]) ? audit.anchorChanges[key] : []
  list.push(now)
  audit.anchorChanges[key] = list.filter((ts) => now - Number(ts) < 30 * 24 * 60 * 60 * 1000).slice(-10)
  saveAudit(root, audit)
}
