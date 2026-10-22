/**
 * 条目访问层：从索引（元/索引.jsonl，增量重建）加载全部条目、按 id 查找、按 id 更新。
 *
 * Phase 2：索引持久化 + 按日档 mtime/size 增量重解析；坏索引自动全量重建。
 */

import { listDays, readDay, writeDay } from './store.js'
import { priority } from './core.js'
import { loadIndexed, invalidateIndex } from './index-store.js'

/** 清空缓存（写入后调用）。 */
export function invalidate() {
  invalidateIndex()
}

/** 统计各轴数量（写日档 front-matter 用）。 */
export function countAxes(entries) {
  const axes = { 德: 0, 智: 0, 体: 0, 美: 0, 劳: 0 }
  for (const e of entries) {
    if (e !== null && typeof e === 'object' && axes[e.axis] !== undefined) axes[e.axis] += 1
  }
  return axes
}

/**
 * 加载全部条目（索引 + 3 秒缓存；强制时重建）。
 * @param root - 记忆根目录。
 * @param opts - { force: 强制重建 }
 * @returns { entries, errors }
 */
export function loadEntries(root, opts = {}) {
  try {
    const got = loadIndexed(root, { force: opts.force === true })
    return { entries: got.entries, errors: [], rebuilt: got.rebuilt }
  } catch (error) {
    // 索引层任何异常都退回 Phase 0 的全量扫描，保证对话不被阻塞。
    const errors = [`index: ${error instanceof Error ? error.message : String(error)}`]
    const entries = []
    for (const day of listDays(root)) {
      try {
        const got = readDay(root, day)
        for (const e of got.entries) entries.push(e)
        if (Array.isArray(got.errors)) errors.push(...got.errors)
      } catch (err) {
        errors.push(`${day}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return { entries, errors }
  }
}

/** 最近 N 天（含今天）的条目。 */
export function recentEntries(root, days = 2, now = Date.now()) {
  const { entries } = loadEntries(root)
  const cutoff = now - days * 24 * 60 * 60 * 1000
  return entries.filter((e) => e !== null && typeof e === 'object' && Number(e.fact_time) >= cutoff && e.status !== 'tombstone')
}

/** 按 id 或 8 位前缀找条目；歧义时返回多个。 */
export function findEntries(root, idOrPrefix) {
  const key = String(idOrPrefix ?? '').trim()
  if (key === '') return []
  const { entries } = loadEntries(root)
  return entries.filter((e) => typeof e?.id === 'string' && e.id.startsWith(key))
}

/**
 * 按 id 更新条目并落盘（只改 patch 里的字段）。
 * @param root - 根目录。
 * @param id - 完整 id。
 * @param patch - 要覆盖的字段。
 * @returns { ok, entry? }
 */
export function updateEntry(root, id, patch) {
  const { entries } = loadEntries(root, { force: true })
  const target = entries.find((e) => e?.id === id)
  if (target === undefined) return { ok: false }
  const day = target.day
  if (typeof day !== 'string' || day === '') return { ok: false }
  const got = readDay(root, day)
  const index = got.entries.findIndex((e) => e?.id === id)
  if (index < 0) return { ok: false }
  const next = { ...got.entries[index], ...patch, touched_at: Date.now() }
  const list = got.entries.slice()
  list[index] = next
  const front = {
    ...got.front,
    entries: list.length,
    axes: countAxes(list)
  }
  writeDay(root, day, front, list)
  invalidate()
  return { ok: true, entry: next }
}

/** 一条记忆的单行注入格式。 */
export function entryLine(entry, { withId = true, maxChars = 200 } = {}) {
  const axis = typeof entry?.axis === 'string' ? entry.axis : '无'
  const i = Number.isFinite(Number(entry?.I)) ? Number(entry.I) : 5
  let text = typeof entry?.text === 'string' ? entry.text.replace(/\s*\n\s*/g, ' ').trim() : ''
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`
  const idPart = withId && typeof entry?.id === 'string' ? `（id: ${entry.id}）` : ''
  return `- [${axis}·I${i}] ${text}${idPart}`
}

/**
 * 取「近况」：最近两天的条目，按优先级取前 N。
 * @param root - 根目录。
 * @param limit - 条数。
 */
export function nearEntries(root, limit = 3, now = Date.now()) {
  return recentEntries(root, 2, now)
    .filter((e) => e.status === 'active' || e.status === 'fresh')
    .sort((a, b) => priority(b, now) - priority(a, now))
    .slice(0, Math.max(0, limit))
}
