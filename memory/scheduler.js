/**
 * 比例调度器（Phase 2 完整版，设计 §8.4）：
 *  - 分桶：近 / 中 / 远 / 事 / 命中 / 待复习
 *  - 桶间配额 = 基础权重 × 本桶优先级质量修正（meanP 与全局 meanP 的平方根比，clamp 0.5–2.0）
 *  - 桶内按 selectionScore（重要度 × 到期 × 相关）排序
 *  - 全局 MMR 去重（λ=0.35）+ 五育轴多样性加成
 *  - 水填充 2 轮；总预算硬上限；单条 ≤300 字
 */

import { retention, priority, selectionScore, truncateText } from './core.js'
import { textSimilarity } from './search.js'

export const BASE_WEIGHTS = { near: 0.22, mid: 0.18, far: 0.14, todo: 0.16, hit: 0.2, due: 0.1 }
const LAMBDA = 0.35
const ITEM_MAX = 300

/** 本地日期 → YYYY-MM。 */
function ymOf(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 上一个月 YYYY-MM。 */
function prevYm(now) {
  const d = new Date(now)
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 是否参与日常调度。 */
function eligible(e) {
  return e !== null && typeof e === 'object' && (e.status === 'active' || e.status === 'fresh')
}

/**
 * 分桶。
 * @param entries - 全部条目
 * @param options - { now, hits: [{entry, rel}] }
 */
export function bucketEntries(entries, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const hits = Array.isArray(options.hits) ? options.hits : []
  const nowYm = ymOf(now)
  const prev = prevYm(now)
  const buckets = { near: [], mid: [], far: [], todo: [], hit: [], due: [] }
  const hitIds = new Set(hits.map((h) => h?.entry?.id).filter((id) => typeof id === 'string'))
  for (const e of entries) {
    if (!eligible(e) || hitIds.has(e.id)) continue
    const ageDays = Math.max(0, (now - Number(e.fact_time || e.created_at || now)) / 86400000)
    const R = retention(e, now)
    const dayYm = typeof e.day === 'string' ? e.day.slice(0, 7) : ''
    if (ageDays <= 3) buckets.near.push({ entry: e, rel: 1 })
    else if (dayYm === nowYm || dayYm === prev) buckets.mid.push({ entry: e, rel: 1 })
    else buckets.far.push({ entry: e, rel: 1 })
    if ((e.kind === 'topic' || e.kind === 'goal') && (e.status === 'active' || e.status === 'fresh')) {
      buckets.todo.push({ entry: e, rel: 1 })
    }
    if (R < 0.55 && e.status === 'active') buckets.due.push({ entry: e, rel: 1 })
  }
  for (const h of hits) {
    if (h?.entry?.id !== undefined) buckets.hit.push({ entry: h.entry, rel: Math.max(0, Number(h.rel) || 0) })
  }
  return buckets
}

/** 桶内平均 P（空桶 0）。 */
function meanP(items, now) {
  if (items.length === 0) return 0
  let sum = 0
  for (const it of items) sum += priority(it.entry, now)
  return sum / items.length
}

/** 相邻桶（权重转移用）。 */
const NEIGHBORS = {
  near: ['mid', 'far'],
  mid: ['near', 'far'],
  far: ['mid', 'near'],
  todo: ['near', 'mid'],
  hit: ['mid', 'near'],
  due: ['near', 'mid']
}

/**
 * 按比例分配并选条。
 * @returns { items: [{entry, bucket, chars}], alloc: {bucket: chars}, dropped }
 */
export function allocateSchedule(buckets, budgetChars = 1000, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const budget = Math.max(120, Math.min(2000, Math.round(Number(budgetChars) || 1000)))
  const present = Object.keys(BASE_WEIGHTS).filter((k) => Array.isArray(buckets?.[k]) && buckets[k].length > 0)
  const dropped = []
  if (present.length === 0) return { items: [], alloc: {}, dropped }
  const allMean = (() => {
    let sum = 0
    let n = 0
    for (const k of present) {
      const items = buckets[k]
      sum += priority(items[0].entry, now) * items.length
      n += items.length
    }
    return n === 0 ? 1 : sum / n
  })()
  // 权重：空桶份额转移给邻桶；再乘本桶 quality 修正
  const weights = {}
  let totalW = 0
  for (const k of present) {
    let w = BASE_WEIGHTS[k]
    for (const missing of Object.keys(BASE_WEIGHTS)) {
      if (present.includes(missing)) continue
      if ((NEIGHBORS[missing] ?? []).includes(k)) w += BASE_WEIGHTS[missing] / (NEIGHBORS[missing] ?? ['x']).length
    }
    const mp = meanP(buckets[k], now)
    const factor = Math.min(2, Math.max(0.5, Math.sqrt(Math.max(0.01, mp) / Math.max(0.01, allMean))))
    weights[k] = w * factor
    totalW += weights[k]
  }
  const alloc = {}
  for (const k of present) {
    alloc[k] = Math.round((budget * weights[k]) / totalW)
  }
  // 桶内排序
  const sorted = {}
  for (const k of present) {
    sorted[k] = buckets[k]
      .map((it) => ({ ...it, score: selectionScore(it.entry, it.rel, now) }))
      .sort((a, b) => b.score - a.score)
  }
  // 按权重换算「条数配额」（比按字符切更稳：单条长度差异太大，小配额会切不出整条）
  const estItems = Math.max(1, Math.min(12, Math.floor(budget / 140)))
  const exact = {}
  let assigned = 0
  for (const k of present) {
    exact[k] = (estItems * weights[k]) / totalW
    assigned += Math.floor(exact[k])
  }
  const counts = {}
  for (const k of present) counts[k] = Math.floor(exact[k])
  // 余数给小数部分最大的桶
  for (const k of [...present].sort((a, b) => (exact[b] % 1) - (exact[a] % 1))) {
    if (assigned >= estItems) break
    counts[k] += 1
    assigned += 1
  }
  // 每个存在的桶至少 1 条（预算够的话）
  if (estItems >= present.length) {
    for (const k of present) if (counts[k] === 0) counts[k] = 1
  }
  // 全局 MMR 选条
  const selected = []
  const selectedIds = new Set()
  const usedAxes = new Set()
  const charUsed = {}
  for (const k of present) charUsed[k] = 0
  let usedChars = 0
  const maxSim = (entry) => {
    let best = 0
    for (const s of selected) {
      const sim = textSimilarity(String(entry.text ?? ''), String(s.entry.text ?? ''))
      if (sim > best) best = sim
    }
    return best
  }
  const takeOne = (k) => {
    const pool = sorted[k]
    let best = null
    let bestAdj = -Infinity
    for (const it of pool) {
      if (selectedIds.has(it.entry.id)) continue
      const axisBonus = usedAxes.has(it.entry.axis) ? 0 : 0.05
      const adj = it.score - LAMBDA * maxSim(it.entry) + axisBonus
      if (adj > bestAdj) {
        bestAdj = adj
        best = it
      }
    }
    if (best === null) return false
    const remaining = budget - usedChars
    if (remaining < 20) return false
    const clipped = truncateText(String(best.entry.text ?? ''), Math.min(ITEM_MAX, remaining))
    const chars = Math.max(20, Math.min(ITEM_MAX, clipped.length))
    selected.push({ entry: best.entry, bucket: k, text: clipped, score: best.score })
    selectedIds.add(best.entry.id)
    if (typeof best.entry.axis === 'string') usedAxes.add(best.entry.axis)
    usedChars += chars
    charUsed[k] += chars
    return true
  }
  // 第一轮：按配额逐桶取
  for (const k of [...present].sort((a, b) => counts[b] - counts[a])) {
    for (let i = 0; i < counts[k]; i += 1) {
      if (takeOne(k) !== true) break
    }
  }
  // 水填充：预算还有余量就按权重继续补（最多 3 轮）
  for (let round = 0; round < 3; round += 1) {
    if (budget - usedChars < 40) break
    let progressed = false
    for (const k of [...present].sort((a, b) => weights[b] - weights[a])) {
      if (budget - usedChars < 40) break
      if (takeOne(k) === true) progressed = true
    }
    if (progressed !== true) break
  }
  for (const k of present) {
    for (const it of sorted[k]) {
      if (!selectedIds.has(it.entry.id)) dropped.push({ id: it.entry.id, bucket: k })
    }
  }
  return {
    items: selected,
    alloc: Object.fromEntries(present.map((k) => [k, charUsed[k]])),
    counts,
    dropped
  }
}

/** 调度摘要（debug/日志）。 */
export function describePlan(items) {
  const counts = {}
  for (const it of items) counts[it.bucket] = (counts[it.bucket] ?? 0) + 1
  return Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ')
}
