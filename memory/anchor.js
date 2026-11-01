/**
 * 四问锚点：读取 / 写入 / 渲染。
 *
 * 锚点不是记忆条目，是每次取用的参照系（设计 §3.2、§11.4）。
 * 基座段（front-matter immutable: true）只允许「重开新卷」——追加版本段，不覆盖旧文。
 */

import { readAnchor, writeAnchor } from './store.js'
import { atomicWrite, readTextSafe } from './store.js'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'

/** 锚点正文上限；超出后旧的「卷·日期」段自动归档到 锚/历史/。 */
export const ANCHOR_CORE_LIMITS = {
  self: 420,
  user: 300,
  origin: 240,
  goal: 300
}

const ANCHOR_HISTORY_LABELS = {
  self: '我是谁',
  user: '你是谁',
  origin: '来处',
  goal: '去处'
}

/** 四问定义（顺序即注入顺序）。 */
export const ANCHOR_SPECS = [
  { key: 'self', file: '锚/我是谁.md', label: '我是谁', empty: '（还没写下自己）' },
  { key: 'user', file: '锚/你是谁.md', label: '你是谁', empty: '（还不了解对方）' },
  { key: 'origin', file: '锚/来处.md', label: '我从哪里来', empty: '（来处尚未成形）' },
  { key: 'goal', file: '锚/去处.md', label: '我要到哪里去', empty: '（还没定下去处）' }
]

/** 按 key 取规格。 */
export function anchorSpec(key) {
  return ANCHOR_SPECS.find((s) => s.key === key) ?? null
}

/**
 * 读取四问。任何一份缺失都返回空内容而不是抛错。
 * @param root - 记忆根目录。
 * @returns { self, user, origin, goal } → { meta, content }
 */
export function readAnchors(root) {
  const out = {}
  for (const spec of ANCHOR_SPECS) {
    try {
      const got = readAnchor(root, spec.key)
      out[spec.key] = {
        meta: got !== null && typeof got === 'object' && got.meta !== undefined ? got.meta : {},
        content: typeof got?.content === 'string' ? got.content.trim() : ''
      }
    } catch {
      out[spec.key] = { meta: {}, content: '' }
    }
  }
  return out
}

/** 单份锚点渲染：有内容用内容，没有用占位。 */
export function renderAnchorLine(spec, anchor) {
  const content = anchor !== null && typeof anchor === 'object' && typeof anchor.content === 'string' && anchor.content.trim() !== ''
    ? anchor.content.trim().replace(/\s*\n\s*/g, ' ')
    : spec.empty
  return `${spec.label}：${content}`
}

/**
 * 渲染注入用的锚点块（≤520 字；超长按行截断，保留四问各一行）。
 * @param anchors - readAnchors() 的结果。
 * @param maxChars - 总长上限。
 * @returns markdown 文本。
 */
export function renderAnchorBlock(anchors, maxChars = 520) {
  const lines = ANCHOR_SPECS.map((spec) => renderAnchorLine(spec, anchors?.[spec.key]))
  let text = lines.join('\n')
  if (text.length > maxChars) {
    const per = Math.max(40, Math.floor((maxChars - 20) / 4))
    text = lines.map((line) => (line.length > per ? `${line.slice(0, per - 1)}…` : line)).join('\n')
  }
  return text
}

/**
 * 写锚点。immutable 的基座只允许 append（重开新卷）。
 * @param root - 根目录。
 * @param key - self|user|origin|goal。
 * @param content - 新正文。
 * @param mode - 'replace'|'append'。
 * @returns { ok, reason? }
 */
export function writeAnchorSafe(root, key, content, mode = 'replace') {
  const spec = anchorSpec(key)
  if (spec === null) return { ok: false, reason: 'unknown-anchor' }
  const text = typeof content === 'string' ? content.trim() : ''
  if (text === '') return { ok: false, reason: 'empty' }
  let current = { meta: {}, content: '' }
  try {
    current = readAnchor(root, key)
  } catch {
    current = { meta: {}, content: '' }
  }
  const immutable = current?.meta?.immutable === true
  if (immutable && mode !== 'append') return { ok: false, reason: 'immutable-需要重开新卷' }
  if (immutable) {
    const version = Number(current?.meta?.version ?? 0) + 1
    const next = `${current.content}\n\n---\n\n## 卷 ${version}（${new Date().toISOString().slice(0, 10)}）\n\n${text}`
    writeAnchor(root, key, next, { version, updated_at: Date.now(), immutable: true })
    return { ok: true, appended: true }
  }
  const version = Number(current?.meta?.version ?? 0) + 1
  writeAnchor(root, key, mode === 'append' ? `${current.content}\n\n${text}` : text, {
    version,
    updated_at: Date.now(),
    immutable: false
  })
  const compacted = compactAnchor(root, key)
  return { ok: true, appended: mode === 'append', compacted }
}

/** 从一段文字中取「卷·YYYY-MM」的归档月份；取不到用当前月。 */
function archiveMonthOf(block, now = Date.now()) {
  const match = /卷[·・]?\s*(\d{4})-(\d{2})/.exec(block)
  if (match !== null) return `${match[1]}-${match[2]}`
  const date = new Date(now)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** 历史文件路径：锚/历史/<key>/YYYY-MM.md。 */
export function anchorHistoryPath(root, key, month) {
  return join(root, '锚', '历史', key, `${month}.md`)
}

const SECTION_DATE_RE = /^卷[·・]\s*(\d{4}-\d{2}-\d{2})/
const SUMMARY_MARK = '（摘要）'

function sectionDate(block) {
  const match = SECTION_DATE_RE.exec(block)
  return match === null ? '' : match[1]
}

function isSummary(block) {
  return /^卷[·・]\s*\d{4}-\d{2}-\d{2}（摘要）/.test(block)
}

/** 去掉「卷·日期：」/「卷·日期（摘要）：」前缀后的正文。 */
function plainSummaryText(block) {
  let text = String(block ?? '')
  for (;;) {
    const prefix = /^卷[·・]\s*\d{4}-\d{2}-\d{2}(?:（[^）]*）)?[：:]\s*/.exec(text)
    if (prefix === null) break
    text = text.slice(prefix[0].length)
  }
  return text.replace(/\s+/g, ' ').trim()
}

/** 确定性摘要：去掉前缀，取前 15 个字符（不调用模型）。 */
function summarizeText(block) {
  return Array.from(plainSummaryText(block)).slice(0, 15).join('')
}

function summaryBlockOf(date, text) {
  return `卷·${date}${SUMMARY_MARK}：${text}`
}

function readHistoryBlocks(root, key) {
  const dir = join(root, '锚', '历史', key)
  let names = []
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.md')).sort()
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    const month = name.replace(/\.md$/, '')
    for (const block of readTextSafe(join(dir, name)).split(/\n{2,}/)) {
      const text = block.trim()
      if (text === '' || text.startsWith('#')) continue
      if (!SECTION_DATE_RE.test(text)) continue
      out.push({ month, block: text, date: sectionDate(text) })
    }
  }
  return out
}

function appendHistoryBlock(root, key, month, block) {
  const file = anchorHistoryPath(root, key, month)
  const prev = readTextSafe(file).trim()
  if (prev.includes(block)) return false
  const header = prev === '' ? `# ${ANCHOR_HISTORY_LABELS[key]} · 历史 ${month}\n\n` : `${prev}\n\n`
  atomicWrite(file, `${header}${block}\n`)
  return true
}

/**
 * 自动锚点生命周期（0.5.1）：
 *  1. 超上限时，归档最旧 5 条未归档「卷·日期」段，正文换成 ≤15 字摘要；
 *  2. 仍超限，重复归档下 5 条；
 *  3. 所有段都已摘要后仍超限，把最旧 10 条摘要两两合并成 5 条，再重复；
 *  4. 原始段始终保存在 锚/历史/<key>/YYYY-MM.md，摘要只是索引，不丢记忆。
 */
export function compactAnchor(root, key, options = {}) {
  const spec = anchorSpec(key)
  if (spec === null) return { ok: false, reason: 'unknown-anchor', compacted: false }
  const max = Number(options.maxChars ?? ANCHOR_CORE_LIMITS[key] ?? 420)
  const current = readAnchor(root, key)
  const original = typeof current?.content === 'string' ? current.content.trim() : ''
  if (original === '') return { ok: true, compacted: false, before: 0, after: 0 }
  const allBlocks = original.split(/\n{2,}/).map((block) => block.trim()).filter((block) => block !== '')
  const datedAt = allBlocks.findIndex((block) => SECTION_DATE_RE.test(block))
  if (datedAt < 0) return { ok: true, compacted: false, before: original.length, after: original.length }
  const prefix = allBlocks.slice(0, datedAt)
  const sections = allBlocks.slice(datedAt).filter((block) => !block.startsWith('更早的卷：'))
  let normalized = false
  for (let index = 0; index < sections.length; index += 1) {
    if (!isSummary(sections[index])) continue
    const date = sectionDate(sections[index])
    const next = summaryBlockOf(date, summarizeText(sections[index]))
    if (next !== sections[index]) {
      sections[index] = next
      normalized = true
    }
  }

  // 旧的归档记录还没有摘要的，先补摘要（摘要不丢原档）。
  const existingSummaries = new Set(sections.filter(isSummary).map((block) => block))
  const missingSummaries = []
  for (const item of readHistoryBlocks(root, key)) {
    const summary = summaryBlockOf(item.date, summarizeText(item.block))
    if (existingSummaries.has(summary)) continue
    if (sections.some((block) => block === item.block)) continue
    missingSummaries.push(summary)
    existingSummaries.add(summary)
  }
  if (missingSummaries.length > 0) sections.unshift(...missingSummaries)
  if (missingSummaries.length > 0) normalized = true

  let moved = 0
  let merged = 0
  const build = () => {
    const months = new Set(readHistoryBlocks(root, key).map((item) => item.month))
    const refs = [...months].sort().map((month) => `更早的卷：锚/历史/${key}/${month}.md`)
    return [...prefix, ...sections, ...refs].join('\n\n')
  }

  while (build().length > max) {
    const originalIndexes = sections
      .map((block, index) => ({ block, index }))
      .filter((item) => !isSummary(item.block))
      .map((item) => item.index)
    if (originalIndexes.length > 0) {
      // 最旧的 5 条未归档段
      const batch = originalIndexes.slice(0, 5)
      for (const index of batch.slice().reverse()) {
        const block = sections[index]
        const month = archiveMonthOf(block, options.now)
        appendHistoryBlock(root, key, month, block)
        sections[index] = summaryBlockOf(sectionDate(block) || month, summarizeText(block))
        moved += 1
      }
      continue
    }
    const summaryIndexes = sections
      .map((block, index) => ({ block, index }))
      .filter((item) => isSummary(item.block))
      .map((item) => item.index)
    if (summaryIndexes.length < 2) break
    // 已全部摘要仍超限：最旧 10 条摘要两两合并成 5 条
    const batch = summaryIndexes.slice(0, 10)
    const batchSet = new Set(batch)
    const mergedBlocks = []
    for (let i = 0; i < batch.length; i += 2) {
      const first = sections[batch[i]]
      const second = batch[i + 1] === undefined ? null : sections[batch[i + 1]]
      const date = sectionDate(first) || new Date().toISOString().slice(0, 10)
      const text = summarizeText(`${plainSummaryText(first)}；${plainSummaryText(second ?? '')}`)
      mergedBlocks.push(summaryBlockOf(date, text))
    }
    const firstPos = batch[0]
    const rest = sections.filter((_, index) => !batchSet.has(index))
    sections.splice(0, sections.length, ...rest.slice(0, firstPos), ...mergedBlocks, ...rest.slice(firstPos))
    merged += batch.length - mergedBlocks.length
  }

  const next = build()
  if (next === original) return { ok: true, compacted: false, before: original.length, after: original.length }
  writeAnchor(root, key, next, {
    ...(current.meta && typeof current.meta === 'object' ? current.meta : {}),
    version: Number(current?.meta?.version ?? 1),
    updated_at: current?.meta?.updated_at ?? Date.now(),
    immutable: current?.meta?.immutable === true
  })
  return {
    ok: true,
    compacted: true,
    before: original.length,
    after: next.length,
    moved,
    merged,
    history: [...new Set(readHistoryBlocks(root, key).map((item) => item.month))].sort()
  }
}

/** 维护 tick 兜底：四问锚点各自检查一次（短锚点不会产生历史）。 */
export function compactAllAnchors(root, options = {}) {
  const out = {}
  for (const spec of ANCHOR_SPECS) {
    try {
      out[spec.key] = compactAnchor(root, spec.key, options)
    } catch (error) {
      out[spec.key] = { ok: false, compacted: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
  return out
}