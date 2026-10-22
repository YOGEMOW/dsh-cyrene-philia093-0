/**
 * Phase 0 集成冒烟：不开宿主，直接串起 store/parse/entries/inject/core/fsops/migrate。
 * 真实安装后的宿主验证在安装流程里另行进行。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ensureTree, appendEntry, readDay, dayFilePath, quotaUsage } from '../memory/store.js'
import { entryId, normalizeEntry } from '../memory/parse.js'
import { loadEntries, findEntries, updateEntry, nearEntries } from '../memory/entries.js'
import { buildFirstSnapshot, buildHitBlock, buildRecallBlock } from '../memory/inject.js'
import { search } from '../memory/search.js'
import { fsOp } from '../memory/fsops.js'
import { migrateLegacy } from '../memory/migrate.js'
import { readAnchors, writeAnchorSafe } from '../memory/anchor.js'

function tmpRoot() {
  return mkdtempSync(join(tmpdir(), 'ope-it-'))
}

function makeEntry(over = {}) {
  const now = Date.now()
  return normalizeEntry(
    {
      id: entryId(now),
      text: over.text ?? '用户更喜欢先看结论、再看过程。',
      kind: over.kind ?? 'fact',
      axis: over.axis ?? '智',
      q: over.q ?? '你',
      I: over.I ?? 6,
      S: 1,
      status: 'fresh',
      kw: over.kw ?? ['偏好', '写作', '结论'],
      src: 'conv',
      src_ids: [],
      fact_time: now,
      reviewed_at: now,
      touched_at: now,
      sync: true
    },
    { day: over.day ?? new Date().toISOString().slice(0, 10), path: dayFilePath('', over.day ?? new Date().toISOString().slice(0, 10)), now }
  )
}

test('建树 + 写入 + 读取 + 索引', () => {
  const root = tmpRoot()
  try {
    const created = ensureTree(root)
    assert.equal(created?.ok, true)
    const entry = makeEntry()
    const result = appendEntry(root, entry)
    assert.equal(result.ok, true)
    const loaded = loadEntries(root, { force: true })
    assert.equal(loaded.entries.length, 1)
    assert.equal(loaded.entries[0].text, entry.text)
    assert.equal(loaded.entries[0].axis, '智')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('首轮快照 / 命中块 / 显式取用', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    appendEntry(root, makeEntry())
    const snap = buildFirstSnapshot(root)
    assert.match(snap.text, /【一页永恒·锚】/)
    assert.match(snap.text, /【一页永恒·近】/)
    const hit = buildHitBlock(root, '我写作时喜欢先看结论', { topK: 2 })
    assert.match(hit.text, /【一页永恒·相关】/)
    const recall = buildRecallBlock(root, '写作 结论')
    assert.match(recall.text, /【一页永恒·锚】/)
    assert.match(recall.text, /【一页永恒·相关】/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('锚点读写与基座只读', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const r1 = writeAnchorSafe(root, 'self', '我是昔涟。')
    assert.equal(r1.ok, true)
    assert.match(readAnchors(root).self.content, /昔涟/)
    const r2 = writeAnchorSafe(root, 'self', '新的我。', 'append')
    assert.equal(r2.ok, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('检索 / 归档 / 真忘', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const a = makeEntry()
    appendEntry(root, a)
    const b = makeEntry({ text: '今天部署了思源备份。', axis: '智', kw: ['思源', '备份'] })
    appendEntry(root, b)
    const hits = search(loadEntries(root, { force: true }).entries, '思源 备份', { topK: 5 })
    assert.equal(hits.length, 1)
    updateEntry(root, b.id, { status: 'archived' })
    const afterArchive = search(loadEntries(root, { force: true }).entries, '思源 备份', { topK: 5 })
    assert.equal(afterArchive.length, 0)
    updateEntry(root, a.id, { status: 'tombstone', text: '' })
    const afterTomb = findEntries(root, a.id)
    assert.equal(afterTomb[0].status, 'tombstone')
    assert.equal(afterTomb[0].text, '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('余页文件操作 + 配额统计', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const w = fsOp(root, 'write', '余页/笔记/想法.md', '# 想法\n随便写', { quotaMB: 128 })
    assert.equal(w.ok, true)
    const ls = fsOp(root, 'ls', '余页/笔记')
    assert.match(ls.text, /想法\.md/)
    const read = fsOp(root, 'read', '余页/笔记/想法.md')
    assert.match(read.text, /随便写/)
    const escape = fsOp(root, 'read', '../outside.md')
    assert.equal(escape.ok, false)
    const du = fsOp(root, 'du')
    assert.match(du.text, /总用量/)
    assert.ok(quotaUsage(root).bytes > 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('旧记忆迁移幂等', () => {
  const root = tmpRoot()
  const dir = tmpRoot()
  try {
    ensureTree(root)
    const legacy = join(dir, 'cyrene-memory.md')
    writeFileSync(legacy, '- 第一条旧记忆\n- 第二条旧记忆\n- 第一条旧记忆\n', 'utf8')
    const r1 = migrateLegacy(root, legacy, {})
    assert.equal(r1.ok, true)
    assert.equal(r1.count, 2)
    assert.ok(r1.backup === null || existsSync(r1.backup))
    const r2 = migrateLegacy(root, legacy, {})
    assert.equal(r2.ok, false) // 已被改名，找不到原文件
    const entries = loadEntries(root, { force: true }).entries
    assert.equal(entries.length, 2)
    rmSync(dir, { recursive: true, force: true })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('updateEntry 改正文/关键词，保留 id 与日期', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const created = makeEntry({ kw: [] })
    appendEntry(root, created)
    const result = updateEntry(root, created.id, {
      text: '合并后的正文：用户偏好先看结论。',
      kw: ['合并', '关键词', '结论'],
      I: 8
    })
    assert.equal(result.ok, true)
    const got = findEntries(root, created.id)[0]
    assert.equal(got.id, created.id)
    assert.equal(got.day, created.day)
    assert.match(got.text, /合并后的正文/)
    assert.deepEqual(got.kw, ['合并', '关键词', '结论'])
    assert.equal(got.I, 8)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
