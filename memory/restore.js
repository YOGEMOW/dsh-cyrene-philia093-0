/**
 * 从思源回灌（灾难恢复）：把「93-昔涟」里 `/一页永恒/` 的备份拉回本地。
 *
 * 恢复策略（见方案 §12.6）：
 *  - 默认 `missing`：只补本地缺失的（按文本 hash 去重），绝不覆盖已有记忆；
 *  - `force`：锚点/梦志允许覆盖，条目仍按 hash 去重（避免重复）。
 *  - 条目元数据在备份里只保留了 axis/q/status（块属性）与正文行；恢复时 I/S 用默认值（I=4/S=1），
 *    kind=fact，src=restore——宁可保守，也不要凭空造出高优先级记忆。
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { entryId, normalizeEntry, hashText } from './parse.js'
import { appendEntry, dayFilePath, readTextSafe, atomicWrite } from './store.js'
import { loadEntries, invalidate } from './entries.js'
import { findNotebook, findDocId, listDocsByPrefix, exportMd } from './siyuan.js'

/** hpath 最后一段是日期 → 返回 YYYY-MM-DD，否则 null。 */
export function dayFromHPath(hpath) {
  const last = String(hpath ?? '').split('/').filter(Boolean).pop() ?? ''
  return /^\d{4}-\d{2}-\d{2}$/.test(last) ? last : null
}

/** 梦志 hpath（…/梦/2026-10-18 · 夜梦）→ 日期。 */
export function dayFromJournalHPath(hpath) {
  const last = String(hpath ?? '').split('/').filter(Boolean).pop() ?? ''
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(last)
  return m === null ? null : m[1]
}

/**
 * 解析镜像条目行：`- 16:07｜美｜I8｜正文（原话：…）`。
 * @returns { time, axis, I, text, quote } | null
 */
export function parseMirrorEntryLine(line) {
  const raw = String(line ?? '').trim()
  const m = /^[-*]\s*(\d{2}:\d{2})｜([^｜]{1,4})｜I(\d{1,2})｜(.+)$/.exec(raw)
  if (m === null) return null
  let text = m[4].trim()
  let quote = ''
  const q = /^(.*?)\s*（原话：([\s\S]*?)）$/.exec(text)
  if (q !== null) {
    text = q[1].trim()
    quote = q[2].trim()
  }
  const axis = ['德', '智', '体', '美', '劳'].includes(m[2]) ? m[2] : '美'
  const importance = Math.min(10, Math.max(1, Number(m[3]) || 4))
  if (text === '' || text.includes('〔此记忆已遗忘〕')) return null
  return { time: m[1], axis, I: importance, text, quote }
}

/** 从导出 Markdown 里提取条目行。 */
export function parseMirrorMarkdown(markdown) {
  const out = []
  for (const line of String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const parsed = parseMirrorEntryLine(line)
    if (parsed !== null) out.push(parsed)
  }
  return out
}

/**
 * 把导出的条目写回本地日档（按文本 hash 去重）。
 * @returns { added, skipped }
 */
export function restoreEntries(root, items, options = {}) {
  const force = options.force === true
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const { entries } = loadEntries(root, { force: true })
  const known = new Set(entries.map((e) => hashText(String(e.text ?? ''))))
  let added = 0
  let skipped = 0
  for (const item of items) {
    if (item === null || typeof item !== 'object' || typeof item.text !== 'string' || item.text.trim() === '') {
      skipped += 1
      continue
    }
    const h = hashText(item.text)
    if (known.has(h) && force !== true) {
      skipped += 1
      continue
    }
    const day = typeof item.day === 'string' ? item.day : new Date(now).toISOString().slice(0, 10)
    const entry = normalizeEntry(
      {
        id: entryId(now + added),
        text: item.text,
        kind: 'fact',
        axis: item.axis ?? '美',
        q: item.q ?? '你',
        I: item.I ?? 4,
        S: 1,
        status: 'active',
        kw: [],
        src: 'restore',
        src_ids: [item.source ?? 'siyuan'],
        src_quote: item.quote ?? '',
        fact_time: now,
        reviewed_at: now,
        touched_at: now,
        created_at: now,
        sync: true,
        n_recall: 0
      },
      { day, path: dayFilePath(root, day), now }
    )
    const result = appendEntry(root, entry)
    if (result?.ok === true) {
      added += 1
      known.add(h)
    } else {
      skipped += 1
    }
  }
  invalidate()
  return { added, skipped }
}

/** 恢复锚点（本地为空才写；force 时覆盖正文但保留 immutable 语义）。 */
export function restoreAnchors(root, anchors, options = {}) {
  const force = options.force === true
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const specs = [
    ['self', '我是谁'],
    ['user', '你是谁'],
    ['origin', '来处'],
    ['goal', '去处']
  ]
  let restored = 0
  for (const [key, label] of specs) {
    const text = typeof anchors?.[key] === 'string' ? anchors[key].trim() : ''
    if (text === '') continue
    const file = join(root, '锚', `${label}.md`)
    const existing = readTextSafe(file)
    if (existing.trim() !== '' && force !== true && isPlaceholderAnchor(existing) !== true) continue
    const content = `---\nversion: 1\nupdated_at: ${now}\nimmutable: false\nrestored: true\n---\n\n${text}\n`
    if (atomicWrite(file, content) === true) restored += 1
  }
  return { restored }
}

/** 占位锚点（ensureTree 种下的空壳）不算「已有内容」，允许回灌覆盖。 */
export function isPlaceholderAnchor(text) {
  const raw = String(text ?? '').trim()
  if (raw === '') return true
  return /还没有成型|还不认识你|来处尚是空白|去处尚未定下/.test(raw)
}

/** 恢复梦志（本地缺失才写；force 覆盖）。 */
export function restoreJournals(root, journals, options = {}) {
  const force = options.force === true
  let restored = 0
  for (const item of journals ?? []) {
    const day = dayFromJournalHPath(item?.hpath ?? '') ?? (typeof item?.day === 'string' ? item.day : null)
    const body = typeof item?.markdown === 'string' ? item.markdown.trim() : ''
    if (day === null || body === '') continue
    const file = join(root, '梦', `${day}.md`)
    if (existsSync(file) === true && force !== true) continue
    if (atomicWrite(file, `# ${day} · 夜梦\n\n${body}\n`) === true) restored += 1
  }
  return { restored }
}

/** 思源 exportMdContent 会在开头带文档属性 YAML + 文档标题行；回灌时都要剥掉。 */
export function stripDocNoise(markdown) {
  let text = String(markdown ?? '')
  for (let i = 0; i < 4; i += 1) {
    const before = text
    text = text.replace(/^\s*---\n[\s\S]*?\n---\n?/, '')
    text = text.replace(/^\s*#{1,6}\s+[^\n]*\n+/, '')
    if (text === before) break
  }
  return text.trim()
}

/**
 * 从思源回灌全部三类产物（条目 / 锚点 / 梦志）。
 * @param cfg - 思源配置（resolveSiYuanConfig 的结果）
 * @param root - 本地记忆根目录
 * @param options - { force }
 */
export async function restoreFromSiYuan(cfg, root, options = {}) {
  const report = {
    ok: false,
    notebook: '',
    docs: { days: 0, anchors: 0, journals: 0 },
    entries: { added: 0, skipped: 0 },
    anchors: { restored: 0 },
    journals: { restored: 0 },
    errors: []
  }
  let notebook = null
  try {
    notebook = await findNotebook(cfg)
  } catch (error) {
    report.errors.push(`连接思源失败：${error instanceof Error ? error.message : String(error)}`)
    return report
  }
  if (notebook === null) {
    report.errors.push(`未找到笔记本「${cfg.notebook}」`)
    return report
  }
  report.notebook = notebook.name
  const now = Date.now()

  // 1) 日档条目
  try {
    const docs = await listDocsByPrefix(cfg, notebook.id, `${cfg.rootHPath}/日/`)
    const items = []
    for (const doc of docs) {
      const day = dayFromHPath(doc.hpath)
      if (day === null) continue
      report.docs.days += 1
      const markdown = await exportMd(cfg, doc.id)
      for (const parsed of parseMirrorMarkdown(markdown)) {
        items.push({ ...parsed, day, source: `siyuan:${doc.hpath}` })
      }
    }
    report.entries = restoreEntries(root, items, { force: options.force === true, now })
  } catch (error) {
    report.errors.push(`条目回灌失败：${error instanceof Error ? error.message : String(error)}`)
  }

  // 2) 锚点
  try {
    const texts = {}
    for (const [key, label] of [['self', '我是谁'], ['user', '你是谁'], ['origin', '来处'], ['goal', '去处']]) {
      const id = await findDocId(cfg, notebook.id, `${cfg.rootHPath}/锚/${label}`)
      if (id === null) continue
      report.docs.anchors += 1
      const markdown = await exportMd(cfg, id)
      const body = stripDocNoise(markdown)
      if (body !== '') texts[key] = body
    }
    report.anchors = restoreAnchors(root, texts, { force: options.force === true, now })
  } catch (error) {
    report.errors.push(`锚点回灌失败：${error instanceof Error ? error.message : String(error)}`)
  }

  // 3) 梦志
  try {
    const docs = await listDocsByPrefix(cfg, notebook.id, `${cfg.rootHPath}/梦/`)
    const journals = []
    for (const doc of docs) {
      const day = dayFromJournalHPath(doc.hpath)
      if (day === null) continue
      report.docs.journals += 1
      journals.push({ hpath: doc.hpath, day, markdown: stripDocNoise(await exportMd(cfg, doc.id)) })
    }
    report.journals = restoreJournals(root, journals, { force: options.force === true })
  } catch (error) {
    report.errors.push(`梦志回灌失败：${error instanceof Error ? error.message : String(error)}`)
  }

  report.ok = report.errors.length === 0
  return report
}

