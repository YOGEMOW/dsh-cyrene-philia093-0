/**
 * 月检 / 年检（五育复检与提升）。
 *
 * 职责：
 *   - 列出待定区并重新给出「还差什么」；
 *   - 把补齐了溯源/后果的待定条目提升进日档（gate: promoted）；
 *   - 月度体检：复用引擎的 monthlyAudit（写进年轮）+ 本插件追加的指标
 *     （待定数、孤岛率、握命推进、天性高低级比）。
 *
 * 判定权仍在模型/人：模块只给证据与通道，不自动改写内容。
 */
import { currentVolume } from './wuyu.mjs'
import { assessWrite } from './wuyu.mjs'
import { loadEntries } from '../memory/entries.js'
import { appendEntry } from '../memory/store.js'
import { listPending, removePending } from '../memory/pending.mjs'
import { monthlyAudit } from '../memory/audit.js'
import { rollCalendars } from '../memory/rolling.js'

/**
 * 待定区清单：每条都重新算一遍「还差什么」。
 * @param root 记忆根目录
 */
export function pendingReport(root) {
  const { entries } = listPending(root)
  return entries.map((entry) => {
    const assessed = assessWrite(entry)
    return {
      id: entry.id,
      day: entry.pending_day ?? entry.day,
      axis: entry.axis,
      kind: entry.kind,
      text: entry.text,
      reasons: assessed.reasons,
      ready: assessed.ok,
    }
  })
}

/**
 * 把一条待定记忆提升进日档（补齐字段后再过一次五育闸门）。
 * @param root 记忆根目录
 * @param id 待定条目 id（完整或前缀）
 * @param enrichment 要补的字段（src_quote/src_ids/consequence/axis/legacy/aim/nature…）
 */
export function promotePending(root, id, enrichment = {}) {
  const { entries } = listPending(root)
  const key = String(id ?? '').trim()
  const matches = entries.filter((entry) => typeof entry?.id === 'string' && entry.id.startsWith(key))
  if (matches.length === 0) return { ok: false, message: '待定区没有这条记忆。' }
  if (matches.length > 1) return { ok: false, message: 'id 前缀有歧义，请给完整 id。' }
  const pending = matches[0]
  const merged = {
    ...pending,
    ...enrichment,
    gate: 'promoted',
    promoted_at: Date.now(),
    source_ref: `余页/待定/${pending.pending_day ?? pending.day}.md`,
    vol: currentVolume(root),
  }
  const assessed = assessWrite(merged)
  if (!assessed.ok) {
    return { ok: false, reasons: assessed.reasons, message: `还不能提升：${assessed.reasons.join('；')}。` }
  }
  const entry = assessed.entry
  entry.gate = 'promoted'
  entry.promoted_at = merged.promoted_at
  entry.source_ref = merged.source_ref
  entry.vol = merged.vol
  const result = appendEntry(root, entry)
  if (!result.ok) return { ok: false, message: `写入日档失败：${result.errors.join('；') || '未知原因'}` }
  removePending(root, pending.id)
  return { ok: true, id: pending.id, day: entry.day, message: `已从待定提升进日档（${entry.day}，id: ${pending.id}）。` }
}

/** 五育统计：给月检/年检用。 */
export function wuyuStats(entries, now = Date.now()) {
  const rows = Array.isArray(entries) ? entries.filter((entry) => entry?.status !== 'tombstone') : []
  const axes = { 德: 0, 智: 0, 体: 0, 美: 0, 劳: 0 }
  let noSource = 0
  let orphan = 0
  let aim = 0
  let natureHigh = 0
  let natureLow = 0
  for (const entry of rows) {
    if (axes[entry.axis] !== undefined) axes[entry.axis] += 1
    const hasSource = (Array.isArray(entry.src_ids) && entry.src_ids.length > 0) || (typeof entry.src_quote === 'string' && entry.src_quote.trim() !== '')
    if (!hasSource) noSource += 1
    if (!Array.isArray(entry.links) || entry.links.length === 0) orphan += 1
    if (typeof entry.aim === 'string' && entry.aim.trim() !== '') aim += 1
    if (entry.nature?.tier === 'high') natureHigh += 1
    if (entry.nature?.tier === 'low') natureLow += 1
  }
  return {
    rows: rows.length,
    axes,
    noSource,
    orphanRate: rows.length === 0 ? 0 : orphan / rows.length,
    aim,
    natureHigh,
    natureLow,
    at: now,
  }
}

/**
 * 月度体检（幂等：engine 的 monthlyAudit 每月只写一次）。
 * @param root 记忆根目录
 * @param now 时间戳（测试可注入）
 */
export function runMonthlyReview(root, now = Date.now()) {
  const entries = loadEntries(root).entries
  const stats = wuyuStats(entries, now)
  let audit = { ok: false, skipped: true }
  try {
    audit = monthlyAudit(root, entries, now)
  } catch {
    /* 体检失败不影响会话 */
  }
  let rolling = null
  try {
    rolling = rollCalendars(root, loadEntries(root).entries, now)
  } catch {
    rolling = null
  }
  return {
    month: new Date(Number(now)).toISOString().slice(0, 7),
    audit,
    rolling,
    stats,
    pending: pendingReport(root),
  }
}

/**
 * 年度体检：年轮 + 待定全量复检清单（不自动提升）。
 */
export function runYearlyReview(root, now = Date.now()) {
  const entries = loadEntries(root).entries
  let rolling = null
  try {
    rolling = rollCalendars(root, loadEntries(root).entries, now)
  } catch {
    rolling = null
  }
  return {
    year: new Date(Number(now)).toISOString().slice(0, 4),
    rolling,
    stats: wuyuStats(entries, now),
    pending: pendingReport(root),
  }
}
