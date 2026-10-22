/**
 * 待定区（五育闸门未通过的记忆）。
 *
 * 位置：`余页/待定/YYYY-MM-DD.md`，与日档同格式（front-matter + `## HH:MM · …` + 元数据注释），
 * 但**不参与日常注入/检索**；月检、年检会重新做五育评估，通过后提升进日档。
 *
 * 约束：
 *   - 所有写入走原子写 + 根目录内路径校验；
 *   - 失败 fail-open（返回 { ok:false, errors }，不抛）。
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseDay, renderFrontMatter, serializeEntry } from './parse.js'
import { atomicWrite, safeRelPath } from './store.js'

const PENDING_DIR = '余页/待定'

function dayOf(now) {
  const d = new Date(Number(now))
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 待定文件路径（根目录内）；非法返回 null。 */
export function pendingPath(root, day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  return safeRelPath(root, `${PENDING_DIR}/${day}.md`)
}

/** 读某一天待定区。 */
export function readPendingDay(root, day) {
  const abs = pendingPath(root, day)
  if (abs === null) return { entries: [], errors: ['日期非法'] }
  try {
    if (!fs.existsSync(abs)) return { entries: [], errors: [] }
    const parsed = parseDay(fs.readFileSync(abs, 'utf8'))
    return { entries: parsed.entries, errors: parsed.errors }
  } catch (error) {
    return { entries: [], errors: [error instanceof Error ? error.message : String(error)] }
  }
}

/** 写某一天待定区（entries 为空时删除文件）。 */
function writePendingDay(root, day, entries) {
  const abs = pendingPath(root, day)
  if (abs === null) return { ok: false, errors: ['日期非法'] }
  try {
    if (entries.length === 0) {
      if (fs.existsSync(abs)) fs.rmSync(abs, { force: true })
      return { ok: true, errors: [] }
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    const front = renderFrontMatter({ date: day, entries: entries.length, pending: true })
    const body = [`# ${day} · 待定`, '', ...entries.map((entry) => serializeEntry(entry).replace(/\n$/, ''))].join('\n')
    const ok = atomicWrite(abs, `${front}${body}\n`)
    return { ok, errors: ok ? [] : ['原子写失败'] }
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] }
  }
}

/**
 * 追加一条待定记忆（同 id 覆盖）。
 * @param root 根目录
 * @param entry 已 normalize 的 Entry（gate 应为 pending）
 */
export function appendPending(root, entry) {
  try {
    const day = typeof entry?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.day) ? entry.day : dayOf(Date.now())
    const current = readPendingDay(root, day)
    const list = current.entries.filter((item) => item?.id !== entry?.id)
    list.push(entry)
    const result = writePendingDay(root, day, list)
    return { ok: result.ok, day, errors: [...current.errors, ...result.errors] }
  } catch (error) {
    return { ok: false, day: '', errors: [error instanceof Error ? error.message : String(error)] }
  }
}

/** 列出全部待定条目（跨日，升序）。 */
export function listPending(root) {
  const out = []
  let absDir
  try {
    absDir = safeRelPath(root, PENDING_DIR)
  } catch {
    return { entries: [], errors: ['根目录非法'] }
  }
  if (absDir === null) return { entries: [], errors: [] }
  try {
    if (!fs.existsSync(absDir)) return { entries: [], errors: [] }
    const files = fs
      .readdirSync(absDir)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
      .sort()
    const errors = []
    for (const name of files) {
      const day = name.slice(0, 10)
      const parsed = readPendingDay(root, day)
      errors.push(...parsed.errors)
      for (const entry of parsed.entries) out.push({ ...entry, pending_day: day })
    }
    return { entries: out, errors }
  } catch (error) {
    return { entries: out, errors: [error instanceof Error ? error.message : String(error)] }
  }
}

/** 从待定区移除一条（提升/丢弃后调用）。 */
export function removePending(root, id) {
  const { entries } = listPending(root)
  const target = entries.find((entry) => entry?.id === id)
  if (target === undefined) return { ok: false, errors: ['待定区没有这条'] }
  const day = target.pending_day
  const current = readPendingDay(root, day)
  const kept = current.entries.filter((entry) => entry?.id !== id)
  const result = writePendingDay(root, day, kept)
  return { ok: result.ok, errors: result.errors }
}

/** 待定条目数。 */
export function pendingCount(root) {
  return listPending(root).entries.length
}
