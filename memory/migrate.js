/**
 * 旧记忆迁移：<DSH_HOME>/cyrene-memory.md（一行一条 `- 内容`）→ 日档条目。
 *
 * 规则（设计 §16.2）：
 *  - 每条生成 Entry：kind=fact、axis=美、q=你、I=5、S=2、src=import、fact_time=导入日
 *  - 原文件不删，改名为 cyrene-memory.md.bak-YYYYMMDD
 *  - 重复运行安全：已迁移过的条目按文本查重跳过
 */

import { existsSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { entryId, normalizeEntry, hashText } from './parse.js'
import { appendEntry, readTextSafe, atomicWrite } from './store.js'
import { loadEntries, invalidate } from './entries.js'

/** 把日期转 YYYY-MM-DD（本地时区）。 */
function dayOf(now) {
  const d = new Date(now)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 执行迁移。
 * @param root - 记忆根目录。
 * @param legacyFile - 旧记忆文件绝对路径。
 * @param options - { now, dryRun }
 * @returns { ok, count, skipped, backup?, reason? }
 */
export function migrateLegacy(root, legacyFile, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  if (typeof legacyFile !== 'string' || !existsSync(legacyFile)) {
    return { ok: false, reason: 'legacy-file-not-found', count: 0, skipped: 0 }
  }
  const raw = readTextSafe(legacyFile).replace(/\r\n?/g, '\n')
  const lines = raw.split('\n')
  const items = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('- ')) continue
    const text = trimmed.slice(2).trim()
    if (text === '' || text.length > 400) continue
    if (items.includes(text)) continue
    items.push(text)
  }
  if (items.length === 0) return { ok: true, count: 0, skipped: 0, backup: null }

  // 已存在的文本（重复运行安全）
  const { entries } = loadEntries(root, { force: true })
  const existing = new Set(entries.map((e) => hashText(e.text ?? '')))
  const day = dayOf(now)
  let count = 0
  let skipped = 0
  for (const text of items) {
    if (existing.has(hashText(text))) {
      skipped += 1
      continue
    }
    if (options.dryRun === true) {
      count += 1
      continue
    }
    const entry = normalizeEntry(
      {
        id: entryId(now + count),
        text,
        kind: 'fact',
        axis: '美',
        q: '你',
        I: 5,
        S: 2,
        status: 'active',
        kw: [],
        src: 'import',
        src_ids: [legacyFile],
        fact_time: now,
        reviewed_at: now,
        sync: true,
        n_recall: 0
      },
      { day, path: `日/${day.slice(0, 4)}/${day.slice(5, 7)}/${day}.md`, now }
    )
    const result = appendEntry(root, entry)
    if (result?.ok === true) count += 1
    else skipped += 1
  }
  invalidate()
  let backup = null
  if (options.dryRun !== true && count > 0) {
    const stamp = dayOf(now).replace(/-/g, '')
    backup = `${legacyFile}.bak-${stamp}`
    try {
      renameSync(legacyFile, backup)
    } catch {
      backup = null
    }
  }
  return { ok: true, count, skipped, backup, total: items.length }
}
