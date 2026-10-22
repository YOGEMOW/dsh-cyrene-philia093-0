/**
 * 持久索引（Phase 2）：把日档条目 + 联结边落到 `元/索引.jsonl`，按文件 mtime/size 增量重建。
 *
 * 目标（设计 §5.4 / §17.3）：
 *  - 每轮取用只做一次「日档文件签名」的轻量遍历，不重读全部日档；
 *  - 冷启动读一次 JSONL；单个日档变化只重解析那一个文件；
 *  - 索引坏/缺失时自动全量重建，最差退化为 Phase 1 的全量扫描（不阻塞对话）。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite } from './store.js'
import { parseDay, hashText } from './parse.js'

/** 内存缓存（进程内）。 */
let cache = { root: '', sig: '', at: 0, entries: [], edges: [] }
const CACHE_MS = 3000

/** 索引文件路径。 */
export function indexPath(root) {
  return join(root, '元', '索引.jsonl')
}

/** 递归收集日档文件：rel（posix）→ { abs, mtime, size, day }。 */
export function dayFiles(root) {
  const out = {}
  const base = join(root, '日')
  const walk = (dir, prefix) => {
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const abs = join(dir, ent.name)
      const rel = prefix === '' ? ent.name : `${prefix}/${ent.name}`
      if (ent.isDirectory()) {
        walk(abs, rel)
        continue
      }
      if (!ent.name.endsWith('.md')) continue
      const day = ent.name.replace(/\.md$/, '')
      if (!/^\d{4}-\d{2}-\d{2}/.test(day)) continue
      try {
        const st = statSync(abs)
        out[`日/${rel}`] = { abs, mtime: st.mtimeMs, size: st.size, day }
      } catch {
        /* 单文件失败忽略 */
      }
    }
  }
  walk(base, '')
  return out
}

/** 当前日档文件签名（rel:mtime:size 排序后哈希）。 */
export function currentSignature(root) {
  const files = dayFiles(root)
  const parts = Object.keys(files).sort().map((rel) => `${rel}:${files[rel].mtime}:${files[rel].size}`)
  return hashText(parts.join('|'))
}

/** 由条目 links 推导去重后的边。 */
export function edgesOf(entries) {
  const seen = new Set()
  const edges = []
  for (const e of entries) {
    if (!Array.isArray(e?.links)) continue
    for (const raw of e.links) {
      const [to, type] = String(raw).split('|')
      if (typeof to !== 'string' || to === '' || to === e.id) continue
      const a = e.id
      const b = to
      const key = a < b ? `${a}>${b}>${type ?? ''}` : `${b}>${a}>${type ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ from: a, to: b, type: type ?? '', w: 1 })
    }
  }
  return edges
}

/** 读持久索引（坏文件返回 null）。 */
export function readIndex(root) {
  let raw = ''
  try {
    raw = readFileSync(indexPath(root), 'utf8')
  } catch {
    return null
  }
  if (raw.trim() === '') return null
  let meta = null
  const entries = []
  const edges = []
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue
    let row = null
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row?.t === 'meta') meta = row
    else if (row?.t === 'entry' && typeof row?.id === 'string') entries.push(row)
    else if (row?.t === 'edge') edges.push(row)
  }
  if (meta === null) return null
  return { meta, entries, edges }
}

/** 写持久索引。 */
export function writeIndex(root, meta, entries, edges) {
  const lines = [JSON.stringify({ t: 'meta', ...meta })]
  for (const e of entries) lines.push(JSON.stringify({ t: 'entry', ...e }))
  for (const edge of edges) lines.push(JSON.stringify({ t: 'edge', ...edge }))
  atomicWrite(indexPath(root), `${lines.join('\n')}\n`)
}

/**
 * 取条目（优先缓存 → 持久索引 → 增量/全量重建）。
 * @returns { entries, edges, rebuilt }
 */
export function loadIndexed(root, options = {}) {
  const force = options.force === true
  const now = Date.now()
  const sig = currentSignature(root)
  if (force !== true && cache.root === root && cache.sig === sig && now - cache.at < CACHE_MS) {
    return { entries: cache.entries, edges: cache.edges, rebuilt: false }
  }
  const files = dayFiles(root)
  const persisted = readIndex(root)
  if (force !== true && persisted !== null && persisted.meta.sig === sig) {
    cache = { root, sig, at: now, entries: persisted.entries, edges: persisted.edges }
    return { entries: persisted.entries, edges: persisted.edges, rebuilt: false }
  }
  // 增量重建：只重解析 mtime/size 有变化的日档
  const oldFiles = persisted !== null && persisted.meta !== null && typeof persisted.meta.files === 'object' ? persisted.meta.files : {}
  const oldEntries = persisted !== null ? persisted.entries : []
  const byDay = new Map()
  for (const e of oldEntries) {
    if (typeof e.day !== 'string') continue
    if (!byDay.has(e.day)) byDay.set(e.day, [])
    byDay.get(e.day).push(e)
  }
  const entries = []
  const fileSigs = {}
  for (const [rel, info] of Object.entries(files)) {
    const fileSig = `${info.mtime}:${info.size}`
    fileSigs[rel] = fileSig
    if (oldFiles[rel] === fileSig && byDay.has(info.day)) {
      entries.push(...byDay.get(info.day))
      continue
    }
    try {
      const got = parseDay(readFileSync(info.abs, 'utf8'))
      for (const e of got.entries) entries.push({ ...e, path: rel })
    } catch {
      /* 坏文件跳过，不影响其余 */
    }
  }
  entries.sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const edges = edgesOf(entries)
  writeIndex(root, { version: 1, builtAt: now, sig, files: fileSigs }, entries, edges)
  cache = { root, sig, at: now, entries, edges }
  return { entries, edges, rebuilt: true }
}

/** 清空内存缓存（写入后调用；下次按签名自动重建）。 */
export function invalidateIndex() {
  cache = { root: '', sig: '', at: 0, entries: [], edges: [] }
}
