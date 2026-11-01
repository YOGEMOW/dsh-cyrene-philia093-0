/**
 * 四问锚点：读取 / 写入 / 渲染。
 *
 * 锚点不是记忆条目，是每次取用的参照系（设计 §3.2、§11.4）。
 * 基座段（front-matter immutable: true）只允许「重开新卷」——追加版本段，不覆盖旧文。
 */

import { readAnchor, writeAnchor } from './store.js'
import { atomicWrite, readTextSafe } from './store.js'
import { join } from 'node:path'

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

/** 把过长的锚点正文按「卷·日期」段归档；只动 dated 段，不丢内容。 */
export function compactAnchor(root, key, options = {}) {
  const spec = anchorSpec(key)
  if (spec === null) return { ok: false, reason: 'unknown-anchor', compacted: false }
  const max = Number(options.maxChars ?? ANCHOR_CORE_LIMITS[key] ?? 420)
  const current = readAnchor(root, key)
  const original = typeof current?.content === 'string' ? current.content.trim() : ''
  if (original === '') return { ok: true, compacted: false, before: 0, after: 0 }
  const blocks = original.split(/\n{2,}/).map((block) => block.trim()).filter((block) => block !== '')
  if (blocks.length <= 1) return { ok: true, compacted: false, before: original.length, after: original.length }
  const datedAt = blocks.findIndex((block) => /^卷[·・]|^---\n+## 卷 /.test(block))
  if (datedAt < 0) return { ok: true, compacted: false, before: original.length, after: original.length }
  const prefix = blocks.slice(0, datedAt)
  const dated = blocks.slice(datedAt)
  const history = new Map()
  let moved = 0
  const build = () => {
    const refs = [...history.keys()].sort().map((month) => `更早的卷：锚/历史/${key}/${month}.md`)
    return [...prefix, ...dated, ...refs].join('\n\n')
  }
  while (build().length > max && dated.length > 1) {
    const block = dated.shift()
    const month = archiveMonthOf(block, options.now)
    if (!history.has(month)) history.set(month, [])
    history.get(month).push(block)
    moved += 1
  }
  if (moved === 0) return { ok: true, compacted: false, before: original.length, after: original.length }
  // 写历史：先读已有，按块去重后追加。
  for (const [month, list] of history) {
    const file = anchorHistoryPath(root, key, month)
    const prev = readTextSafe(file).trim()
    const header = prev === ''
      ? `# ${ANCHOR_HISTORY_LABELS[key]} · 历史 ${month}\n\n`
      : `${prev}\n\n`
    const fresh = list.filter((block) => !prev.includes(block))
    if (fresh.length === 0) continue
    atomicWrite(file, `${header}${fresh.join('\n\n')}\n`)
  }
  const next = build()
  // 压缩不是语义变更：保持原版本与更新时间，只让正文变短。
  writeAnchor(root, key, next, {
    ...(current.meta && typeof current.meta === 'object' ? current.meta : {}),
    version: Number(current?.meta?.version ?? 1),
    updated_at: current?.meta?.updated_at ?? Date.now(),
    immutable: current?.meta?.immutable === true
  })
  return { ok: true, compacted: true, before: original.length, after: next.length, moved, history: [...history.keys()].sort() }
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