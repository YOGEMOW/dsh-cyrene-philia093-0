/**
 * 思源笔记（SiYuan）单向镜像：本地记忆 → 思源笔记本（默认「93-昔涟」）。
 *
 * 事实依据（2026-10-18 实测，SiYuan 3.8.7）：
 *  - 内核 http://127.0.0.1:6806，环回来源免 token；官方头 Authorization: Token <api.token>
 *  - createDocWithMd **不是 upsert**：调用前必须先 getIDsByHPath 查
 *  - appendBlock/insertBlock 不幂等；updateBlock 同内容重试安全
 *  - setBlockAttrs 是合并语义，custom-* 做幂等键
 *  - SQL 默认只回 64 行；写后读先 sqlite/flushTransaction
 *  - 本机同步是手动模式（启动/退出同步），写入 ≠ 已上云
 *
 * 设计（见方案 §12）：文档 = 本地文件，块 = 一条记忆，custom-memory-id 做幂等键；
 * 本地为真相，思源为副本；失败静默重试，不影响对话。
 */

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { readJSON, writeJSON } from './store.js'
import { hashText } from './parse.js'
import { listFreeArea, planFreeSync, renderFreeContent } from './freearea.js'

/** 默认配置。 */
export const SIYUAN_DEFAULTS = {
  enabled: true,
  baseURL: 'http://127.0.0.1:6806',
  notebook: '93-昔涟',
  rootHPath: '/一页永恒',
  tokenEnv: 'SIYUAN_API_TOKEN',
  timeoutMs: 5000,
  createNotebook: false
}

/** 归一配置。 */
export function resolveSiYuanConfig(raw) {
  const c = raw !== null && typeof raw === 'object' ? raw : {}
  const num = (v, d, lo, hi) => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
  }
  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : SIYUAN_DEFAULTS.enabled,
    baseURL: typeof c.baseURL === 'string' && c.baseURL.trim() !== '' ? c.baseURL.trim().replace(/\/+$/, '') : SIYUAN_DEFAULTS.baseURL,
    notebook: typeof c.notebook === 'string' && c.notebook.trim() !== '' ? c.notebook.trim() : SIYUAN_DEFAULTS.notebook,
    rootHPath: typeof c.rootHPath === 'string' && c.rootHPath.trim() !== '' ? c.rootHPath.trim() : SIYUAN_DEFAULTS.rootHPath,
    tokenEnv: typeof c.tokenEnv === 'string' && c.tokenEnv.trim() !== '' ? c.tokenEnv.trim() : SIYUAN_DEFAULTS.tokenEnv,
    timeoutMs: num(c.timeoutMs, SIYUAN_DEFAULTS.timeoutMs, 500, 30000),
    createNotebook: typeof c.createNotebook === 'boolean' ? c.createNotebook : SIYUAN_DEFAULTS.createNotebook
  }
}

/** 取 token（只从环境变量；配置里不落明文）。 */
function tokenOf(cfg) {
  try {
    const t = process.env[cfg.tokenEnv]
    return typeof t === 'string' && t.trim() !== '' ? t.trim() : ''
  } catch {
    return ''
  }
}

/** 调内核 API，返回 data；code!=0 抛错（调用方兜底）。 */
async function api(cfg, path, payload = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  try {
    const headers = { 'Content-Type': 'application/json' }
    const token = tokenOf(cfg)
    if (token !== '') headers.Authorization = `Token ${token}`
    const res = await fetch(`${cfg.baseURL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}`)
    const body = await res.json()
    if (body === null || typeof body !== 'object' || body.code !== 0) {
      throw new Error(`${path} code=${body?.code} msg=${String(body?.msg ?? '')}`)
    }
    return body.data
  } finally {
    clearTimeout(timer)
  }
}

/** 找笔记本：精确名 → 「93-」前缀 → 含「昔涟」。 */
export async function findNotebook(cfg) {
  const data = await api(cfg, '/api/notebook/lsNotebooks', {})
  const list = Array.isArray(data?.notebooks) ? data.notebooks : []
  const exact = list.find((n) => n?.name === cfg.notebook)
  if (exact !== undefined) return { id: exact.id, name: exact.name }
  const byPrefix = list.find((n) => typeof n?.name === 'string' && n.name.startsWith('93-'))
  if (byPrefix !== undefined) return { id: byPrefix.id, name: byPrefix.name }
  const byKeyword = list.find((n) => typeof n?.name === 'string' && n.name.includes('昔涟'))
  if (byKeyword !== undefined) return { id: byKeyword.id, name: byKeyword.name }
  return null
}

/** 建笔记本。 */
export async function createNotebook(cfg) {
  const data = await api(cfg, '/api/notebook/createNotebook', { name: cfg.notebook })
  const id = data?.notebook?.id
  if (typeof id !== 'string' || id === '') throw new Error('createNotebook 未返回 id')
  return { id, name: cfg.notebook }
}

/** 取文档 id（不存在返回 null）。 */
export async function findDocId(cfg, notebookId, hpath) {
  const data = await api(cfg, '/api/filetree/getIDsByHPath', { notebook: notebookId, path: hpath })
  return Array.isArray(data) && data.length > 0 ? data[0] : null
}

/** 建文档（先查重，绝不重复建）。 */
export async function ensureDoc(cfg, notebookId, hpath, markdown = '') {
  const existing = await findDocId(cfg, notebookId, hpath)
  if (existing !== null) return { id: existing, created: false }
  const data = await api(cfg, '/api/filetree/createDocWithMd', {
    notebook: notebookId,
    path: hpath,
    markdown: markdown !== '' ? markdown : `# ${hpath.split('/').filter(Boolean).pop() ?? '记忆'}\n`
  })
  if (typeof data !== 'string' || data === '') throw new Error('createDocWithMd 未返回文档 id')
  return { id: data, created: true }
}

/** 按属性查块（幂等兜底）。 */
async function findBlockByMemoryId(cfg, entryId) {
  const stmt = `SELECT block_id FROM attributes WHERE name='custom-memory-id' AND value='${entryId.replace(/'/g, "''")}' LIMIT 3`
  const rows = await api(cfg, '/api/query/sql', { stmt })
  if (!Array.isArray(rows) || rows.length === 0) return null
  return typeof rows[0]?.block_id === 'string' ? rows[0].block_id : null
}

/** 一条记忆 → 思源单块 markdown（单块，便于 updateBlock 幂等覆盖）。 */
export function renderEntryBlock(entry) {
  const time = typeof entry?.created_at === 'number' ? new Date(entry.created_at) : new Date()
  const hhmm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
  const text = String(entry?.text ?? '').replace(/\s*\n\s*/g, ' ').trim()
  if (entry?.status === 'tombstone' || text === '') {
    return `- ${hhmm}｜〔此记忆已遗忘〕`
  }
  const parts = [`- ${hhmm}｜${entry?.axis ?? '无'}｜I${entry?.I ?? 5}｜${text}`]
  if (typeof entry?.src_quote === 'string' && entry.src_quote.trim() !== '') {
    parts.push(`（原话：${entry.src_quote.trim()}）`)
  }
  return parts.join('')
}

/** 块属性（幂等键 + 检索标签）。 */
function attrsOf(entry) {
  return {
    'custom-memory-id': String(entry.id ?? ''),
    'custom-memory-hash': hashText(JSON.stringify({ t: entry.text ?? '', s: entry.status ?? '', i: entry.I ?? 0 })),
    'custom-memory-axis': String(entry.axis ?? ''),
    'custom-memory-q': String(entry.q ?? ''),
    'custom-memory-status': String(entry.status ?? '')
  }
}

/** 镜像状态文件路径。 */
function statePath(root) {
  return join(root, '元', '思源镜像.json')
}

/** 读状态。 */
export function loadMirrorState(root) {
  const state = readJSON(statePath(root), null)
  if (state === null || typeof state !== 'object') return { notebookId: '', docs: {}, blocks: {}, journals: {}, anchors: {}, free: {}, lastSync: 0, error: '' }
  return {
    notebookId: typeof state.notebookId === 'string' ? state.notebookId : '',
    docs: state.docs !== null && typeof state.docs === 'object' ? state.docs : {},
    blocks: state.blocks !== null && typeof state.blocks === 'object' ? state.blocks : {},
    journals: state.journals !== null && typeof state.journals === 'object' ? state.journals : {},
    anchors: state.anchors !== null && typeof state.anchors === 'object' ? state.anchors : {},
    free: state.free !== null && typeof state.free === 'object' ? state.free : {},
    freeLegacyDone: typeof state.freeLegacyDone === 'string' ? state.freeLegacyDone : '',
    lastSync: Number(state.lastSync) || 0,
    error: ''
  }
}

/** 写状态。 */
export function saveMirrorState(root, state) {
  try {
    writeJSON(statePath(root), state)
  } catch {
    /* 状态写失败只影响下次重查 */
  }
}

/** 文档 hpath：/一页永恒/日/2026/10/2026-10-18 */
export function docHPath(cfg, entry) {
  const day = typeof entry?.day === 'string' ? entry.day : new Date().toISOString().slice(0, 10)
  const [y, m] = day.split('-')
  return `${cfg.rootHPath}/日/${y}/${m}/${day}`
}

/**
 * 镜像一批记忆。失败条目留在 pending，不抛。
 * @returns { ok, synced, updated, skipped, errors[], notebookId }
 */
export async function syncEntries(cfg, root, entries) {
  const result = { ok: false, synced: 0, updated: 0, skipped: 0, errors: [], notebookId: '' }
  if (cfg.enabled !== true) {
    result.errors.push('siyuan disabled')
    return result
  }
  const state = loadMirrorState(root)
  let notebook = null
  try {
    notebook = await findNotebook(cfg)
    if (notebook === null && cfg.createNotebook === true) notebook = await createNotebook(cfg)
  } catch (error) {
    result.errors.push(`连接思源失败：${error instanceof Error ? error.message : String(error)}`)
    return result
  }
  if (notebook === null) {
    result.errors.push(`未找到笔记本「${cfg.notebook}」`)
    return result
  }
  state.notebookId = notebook.id
  result.notebookId = notebook.id
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') continue
    if (entry.sync === false) {
      result.skipped += 1
      continue
    }
    try {
      const hpath = docHPath(cfg, entry)
      let docId = state.docs[hpath]
      if (typeof docId !== 'string' || docId === '') {
        const doc = await ensureDoc(cfg, notebook.id, hpath)
        docId = doc.id
        state.docs[hpath] = docId
      }
      const known = state.blocks[entry.id]
      let blockId = known !== null && typeof known === 'object' && typeof known.blockId === 'string' ? known.blockId : ''
      const markdown = renderEntryBlock(entry)
      if (blockId !== '') {
        await api(cfg, '/api/block/updateBlock', { id: blockId, dataType: 'markdown', data: markdown })
        await api(cfg, '/api/attr/setBlockAttrs', { id: blockId, attrs: attrsOf(entry) })
        result.updated += 1
      } else {
        // 状态丢失时按属性反查，避免重复块
        blockId = await findBlockByMemoryId(cfg, entry.id)
        if (blockId !== null) {
          await api(cfg, '/api/block/updateBlock', { id: blockId, dataType: 'markdown', data: markdown })
          await api(cfg, '/api/attr/setBlockAttrs', { id: blockId, attrs: attrsOf(entry) })
          result.updated += 1
        } else {
          const data = await api(cfg, '/api/block/appendBlock', {
            parentID: docId,
            dataType: 'markdown',
            data: markdown
          })
          blockId = data?.doOperations?.[0]?.id ?? data?.[0]?.doOperations?.[0]?.id
          if (typeof blockId !== 'string' || blockId === '') throw new Error('appendBlock 未返回块 id')
          await api(cfg, '/api/attr/setBlockAttrs', { id: blockId, attrs: attrsOf(entry) })
          result.synced += 1
        }
      }
      state.blocks[entry.id] = {
        blockId,
        docId,
        hash: attrsOf(entry)['custom-memory-hash'],
        synced_at: Date.now(),
        state: 'pending'
      }
    } catch (error) {
      result.errors.push(`${entry.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  try {
    await api(cfg, '/api/sqlite/flushTransaction', {})
  } catch {
    /* 索引落盘失败不影响块内容 */
  }
  state.lastSync = Date.now()
  saveMirrorState(root, state)
  result.ok = result.errors.length === 0
  return result
}

/** 锚点镜像：每份一个文档，内容变化时追加「卷 N」块（保留历史）。 */
/** SQL 字符串字面量。 */
function sqlStr(text) {
  return `'${String(text ?? '').replace(/'/g, "''")}'`
}

/**
 * 同一 hpath 的文档去重：SiYuan 允许重复 hpath，多次重建/双进程可能留下多篇。
 * 保留 preferredId（若有），否则保留 id 最大（时间前缀最新），其余删除。
 */
async function dedupeDocsByHPath(cfg, hpath, preferredId = '') {
  try {
    const rows = await querySql(cfg, `SELECT id FROM blocks WHERE type='d' AND hpath = ${sqlStr(hpath)} LIMIT 50`)
    const ids = (rows ?? [])
      .map((row) => row?.id)
      .filter((id) => typeof id === 'string' && id !== '')
    if (ids.length === 0) return ''
    if (ids.length === 1) return ids[0]
    const keep = ids.includes(preferredId) ? preferredId : ids.slice().sort().at(-1)
    for (const id of ids) {
      if (id === keep) continue
      try {
        await removeDoc(cfg, id)
      } catch {
        /* 单篇删除失败不影响其余 */
      }
    }
    return keep
  } catch {
    return preferredId
  }
}

export async function syncAnchors(cfg, root, anchors) {
  const result = { ok: false, synced: 0, errors: [], notebookId: '' }
  if (cfg.enabled !== true) return result
  const state = loadMirrorState(root)
  let notebook = null
  try {
    notebook = await findNotebook(cfg)
  } catch (error) {
    result.errors.push(`连接思源失败：${error instanceof Error ? error.message : String(error)}`)
    return result
  }
  if (notebook === null) {
    result.errors.push(`未找到笔记本「${cfg.notebook}」`)
    return result
  }
  state.notebookId = notebook.id
  result.notebookId = notebook.id
  const specs = [
    ['self', '我是谁'],
    ['user', '你是谁'],
    ['origin', '来处'],
    ['goal', '去处']
  ]
  for (const [key, label] of specs) {
    const anchor = anchors?.[key]
    const content = typeof anchor?.content === 'string' ? anchor.content.trim() : ''
    if (content === '') continue
    try {
      const hpath = `${cfg.rootHPath}/锚/${label}`
      const hash = hashText(content)
      state.anchors = state.anchors !== null && typeof state.anchors === 'object' ? state.anchors : {}
      const known = state.anchors[key]
      let docId = typeof state.docs[hpath] === 'string' ? state.docs[hpath] : ''
      if (docId === '') docId = (await findDocId(cfg, notebook.id, hpath)) ?? ''
      // 顺手去重：历史重复文档（同 hpath 多篇）在这里收拢成一篇
      docId = (await dedupeDocsByHPath(cfg, hpath, docId)) || docId
      // 锚点用整篇重建（内容小、变化少）：避免「卷 N」块越叠越多、标题重复、旧版残留。
      if (docId !== '' && known !== null && typeof known === 'object' && known.hash === hash) continue
      if (docId !== '') {
        try {
          await removeDoc(cfg, docId)
        } catch {
          /* 删除失败则继续新建（可能同名，可接受） */
        }
        docId = ''
      }
      const createdId = await api(cfg, '/api/filetree/createDocWithMd', {
        notebook: notebook.id,
        path: hpath,
        markdown: content
      })
      if (typeof createdId !== 'string' || createdId === '') throw new Error('createDocWithMd 未返回文档 id')
      state.docs[hpath] = createdId
      state.anchors[key] = { hash, docId: createdId, synced_at: Date.now() }
      result.synced += 1
    } catch (error) {
      result.errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  try {
    await api(cfg, '/api/sqlite/flushTransaction', {})
  } catch {
    /* ignore */
  }
  state.lastSync = Date.now()
  saveMirrorState(root, state)
  result.ok = result.errors.length === 0
  return result
}

/**
 * 镜像余页：一个文本文件 = 一篇思源文档，落在 `${rootHPath}/余页/...`。
 *  - 跳过 `余页/.nosync/`
 *  - hash 相同跳过；内容变化整篇重建（避免残留旧段落）
 *  - 本地文件删了 → 删对应思源文档
 */
export async function syncFreeArea(cfg, root) {
  const result = { ok: false, synced: 0, deleted: 0, errors: [], notebookId: '' }
  if (cfg.enabled !== true) return result
  const state = loadMirrorState(root)
  let notebook = null
  try {
    notebook = await findNotebook(cfg)
  } catch (error) {
    result.errors.push(`notebook: ${error instanceof Error ? error.message : String(error)}`)
    return result
  }
  if (notebook === null) {
    result.errors.push('找不到思源笔记本')
    return result
  }
  state.notebookId = notebook.id
  state.free = state.free !== null && typeof state.free === 'object' ? state.free : {}
  // 目录改名迁移：旧「自留地」「如我所书」→「余页」。清掉旧状态键，并删掉思源里旧 hpath 下的残留文档。
  const legacyPrefixes = ['自留地/', '如我所书/']
  const legacyKeys = Object.keys(state.free).filter((rel) => legacyPrefixes.some((p) => rel.startsWith(p)))
  for (const rel of legacyKeys) {
    const prev = state.free[rel]
    if (prev !== null && typeof prev === 'object' && typeof prev.docId === 'string' && prev.docId !== '') {
      try {
        await removeDoc(cfg, prev.docId)
      } catch {
        /* 旧文档可能已删 */
      }
    }
    delete state.free[rel]
  }
  if (state.freeLegacyDone !== '余页2') {
    for (const legacyName of ['自留地', '如我所书']) {
      const legacyPrefix = `${cfg.rootHPath}/${legacyName}`
      // 清掉旧路径下的文档，以及旧路径的「父文档」本身（SiYuan 的嵌套路径会把每一段建成文档）
      try {
        const rows = await querySql(cfg, `SELECT id FROM blocks WHERE type='d' AND hpath LIKE '${legacyPrefix}/%' LIMIT 200`)
        for (const row of rows ?? []) {
          try {
            await removeDoc(cfg, row.id)
          } catch {
            /* ignore */
          }
        }
        const parents = await querySql(cfg, `SELECT id FROM blocks WHERE type='d' AND hpath = '${legacyPrefix}' LIMIT 10`)
        for (const row of parents ?? []) {
          try {
            await removeDoc(cfg, row.id)
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* 查询失败下次再试 */
      }
      // 状态里的旧 docs 映射也一并清掉，避免下次误用旧 docId
      for (const key of Object.keys(state.docs ?? {})) {
        if (key === legacyPrefix || key.startsWith(`${legacyPrefix}/`)) delete state.docs[key]
      }
    }
    state.freeLegacyDone = '余页2'
  }
  const files = listFreeArea(root)
  const plan = planFreeSync(files, state.free)
  for (const f of plan.upserts) {
    try {
      const hpath = freeHPath(cfg, f.rel)
      const prev = state.free[f.rel]
      const preferred = prev !== null && typeof prev === 'object' && typeof prev.docId === 'string' ? prev.docId : ''
      const existing = await dedupeDocsByHPath(cfg, hpath, preferred)
      if (existing !== '') {
        try {
          await removeDoc(cfg, existing)
        } catch {
          /* 旧文档已不存在也继续 */
        }
      }
      const docId = await api(cfg, '/api/filetree/createDocWithMd', {
        notebook: notebook.id,
        path: hpath,
        markdown: renderFreeContent(f.rel, f.text)
      })
      if (typeof docId !== 'string' || docId === '') throw new Error('createDocWithMd 未返回文档 id')
      state.free[f.rel] = { docId, hash: f.hash, synced_at: Date.now() }
      state.docs[hpath] = docId
      result.synced += 1
    } catch (error) {
      result.errors.push(`${f.rel}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  for (const rel of plan.deletes) {
    const prev = state.free[rel]
    if (prev !== null && typeof prev === 'object' && typeof prev.docId === 'string' && prev.docId !== '') {
      try {
        await removeDoc(cfg, prev.docId)
        result.deleted += 1
      } catch (error) {
        result.errors.push(`delete ${rel}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
    }
    delete state.free[rel]
  }
  try {
    await api(cfg, '/api/sqlite/flushTransaction', {})
  } catch {
    /* flush 失败不影响下次重试 */
  }
  state.lastSync = Date.now()
  saveMirrorState(root, state)
  result.ok = result.errors.length === 0
  return result
}

/** 余页文件 → 思源文档 hpath（md 去掉扩展名，其他保留扩展名避免混淆）。 */
export function freeHPath(cfg, rel) {
  const normalized = String(rel ?? '').replace(/\\/g, '/')
  const lowered = normalized.toLowerCase()
  const strip = lowered.endsWith('.md') || lowered.endsWith('.markdown')
  const withoutExt = strip ? normalized.replace(/\.(md|markdown)$/i, '') : normalized
  return `${cfg.rootHPath}/${withoutExt}`
}

/** 连接测试：只读。 */
export async function ping(cfg) {
  const version = await api(cfg, '/api/system/version', {})
  const notebook = await findNotebook(cfg)
  return { version, notebook }
}

/**
 * 梦志正文归一：去掉文件自带的 `# 标题` 行——文档标题已经由 hpath 表达，
 * 正文里再出现一遍就会出现「同一个标题显示三次」（2026-10-18 用户截图踩到）。
 */
export function normalizeJournalBody(text) {
  return String(text ?? '')
    // 去掉文件开头的一级标题（文档标题由 hpath 表达）；保留正文里的 ## 日期 梦志
    .replace(/^(?:\s*#[^#\n][^\n]*\n+\s*)+/, '')
    .replace(/^\s+/, '')
    .trim()
}

/** 删除文档（用于「整篇重建」式更新）。 */
export async function removeDoc(cfg, id) {
  await api(cfg, '/api/filetree/removeDocByID', { id })
}

/**
 * 镜像一篇梦志：文档标题 = 「YYYY-MM-DD · 夜梦」，正文 = 归一后的梦志正文。
 *
 * 幂等策略（整篇级）：
 *  - 同一份内容（hash 相同）→ 跳过；
 *  - 内容变化 → 删除旧文档再重建（梦志是整篇产物，块级 update 只会更新首块、留下旧段落）；
 *  - 顺手清掉旧版路径 `/梦/YYYY-MM-DD`（v1 的重复标题实现）。
 */
export async function syncJournal(cfg, root, day, text) {
  const body = normalizeJournalBody(text)
  if (cfg.enabled !== true || body === '') return { ok: false, reason: 'disabled-or-empty' }
  const state = loadMirrorState(root)
  let notebook = null
  try {
    notebook = await findNotebook(cfg)
  } catch (error) {
    return { ok: false, reason: `连接思源失败：${error instanceof Error ? error.message : String(error)}` }
  }
  if (notebook === null) return { ok: false, reason: `未找到笔记本「${cfg.notebook}」` }
  state.notebookId = notebook.id
  const hpath = `${cfg.rootHPath}/梦/${day} · 夜梦`
  const legacyHpath = `${cfg.rootHPath}/梦/${day}`
  try {
    // 清掉 v1 的旧文档（重复标题那份）
    const legacyId = (typeof state.docs[legacyHpath] === 'string' ? state.docs[legacyHpath] : '') || (await findDocId(cfg, notebook.id, legacyHpath)) || ''
    if (legacyId !== '') {
      try {
        await removeDoc(cfg, legacyId)
      } catch {
        /* 已被用户删掉也无妨 */
      }
      delete state.docs[legacyHpath]
    }
    const hash = hashText(body)
    state.journals = state.journals !== null && typeof state.journals === 'object' ? state.journals : {}
    let docId = typeof state.docs[hpath] === 'string' ? state.docs[hpath] : ''
    if (docId === '') docId = (await findDocId(cfg, notebook.id, hpath)) ?? ''
    docId = (await dedupeDocsByHPath(cfg, hpath, docId)) || docId
    const known = state.journals[day]
    if (docId !== '' && known !== null && typeof known === 'object' && known.hash === hash) {
      return { ok: true, skipped: true, docId }
    }
    if (docId !== '') {
      try {
        await removeDoc(cfg, docId)
      } catch {
        /* 删除失败则下面重建可能产生同名文档，接受 */
      }
      docId = ''
    }
    const createdId = await api(cfg, '/api/filetree/createDocWithMd', {
      notebook: notebook.id,
      path: hpath,
      markdown: body
    })
    if (typeof createdId !== 'string' || createdId === '') throw new Error('createDocWithMd 未返回文档 id')
    state.docs[hpath] = createdId
    state.journals[day] = { hash, docId: createdId, synced_at: Date.now() }
    state.lastSync = Date.now()
    saveMirrorState(root, state)
    try {
      await api(cfg, '/api/sqlite/flushTransaction', {})
    } catch {
      /* ignore */
    }
    return { ok: true, docId: createdId, rebuilt: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/** 诊断日志。 */
export function logMirror(root, line) {
  try {
    appendFileSync(join(root, '元', '思源镜像.log'), `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    /* ignore */
  }
}

/** SQL 查询（回灌用；显式 LIMIT，避免默认 64 行截断）。 */
export async function querySql(cfg, stmt) {
  const data = await api(cfg, '/api/query/sql', { stmt })
  return Array.isArray(data) ? data : []
}

/** 导出整篇文档 Markdown。 */
export async function exportMd(cfg, id) {
  const data = await api(cfg, '/api/export/exportMdContent', { id })
  return typeof data?.content === 'string' ? data.content : ''
}

/** 分页列出某 hpath 前缀下的文档（type='d'）。 */
export async function listDocsByPrefix(cfg, notebookId, prefix, options = {}) {
  const page = 200
  const max = Number.isFinite(options.max) ? Math.max(1, Math.min(2000, options.max)) : 1000
  const safePrefix = String(prefix).replace(/'/g, "''")
  const box = String(notebookId).replace(/'/g, "''")
  const out = []
  for (let offset = 0; out.length < max; offset += page) {
    const rows = await querySql(
      cfg,
      `SELECT id,hpath FROM blocks WHERE type='d' AND box='${box}' AND hpath LIKE '${safePrefix}%' ORDER BY hpath LIMIT ${page} OFFSET ${offset}`
    )
    if (rows.length === 0) break
    out.push(...rows)
    if (rows.length < page) break
  }
  return out.slice(0, max)
}
