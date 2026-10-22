import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ensureTree, appendEntry, dayFilePath } from '../memory/store.js'
import { entryId, normalizeEntry } from '../memory/parse.js'
import { loadIndexed, indexPath, invalidateIndex } from '../memory/index-store.js'
import { invalidate, loadEntries } from '../memory/entries.js'

function tmpRoot() {
  return join(mkdtempSync(join(tmpdir(), 'ope-index-')), 'cyrene-philia093-0')
}

function makeEntry(day, text) {
  const now = Date.now()
  return normalizeEntry(
    { id: entryId(now + Math.random() * 1000), text, kind: 'fact', axis: '智', q: '你', I: 5, S: 1, status: 'active', kw: ['索引'], src: 'conv', src_ids: [], fact_time: now, reviewed_at: now, touched_at: now, sync: true, n_recall: 0 },
    { day, path: dayFilePath('', day), now }
  )
}

test('索引：首次构建写盘，二次命中持久索引', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    appendEntry(root, makeEntry('2026-10-18', '第一条'))
    appendEntry(root, makeEntry('2026-10-18', '第二条'))
    const first = loadIndexed(root, { force: true })
    assert.equal(first.entries.length, 2)
    assert.equal(first.rebuilt, true)
    assert.ok(existsSync(indexPath(root)))
    assert.match(readFileSync(indexPath(root), 'utf8'), /"t":"meta"/)
    invalidateIndex()
    const second = loadIndexed(root)
    assert.equal(second.entries.length, 2)
    assert.equal(second.rebuilt, false)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('索引：新增日档只增量重解析，删除文件后条目消失', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    appendEntry(root, makeEntry('2026-10-17', '昨天'))
    loadIndexed(root, { force: true })
    appendEntry(root, makeEntry('2026-10-18', '今天'))
    invalidate()
    const got = loadIndexed(root)
    assert.equal(got.entries.length, 2)
    assert.equal(got.rebuilt, true)
    // 删除今天的日档
    const file = join(root, '日', '2026', '10', '2026-10-18.md')
    unlinkSync(file)
    invalidate()
    const after = loadIndexed(root)
    assert.equal(after.entries.length, 1)
    assert.equal(after.entries[0].text, '昨天')
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('索引：hand-edit 日档后能被重新解析', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    appendEntry(root, makeEntry('2026-10-18', '原始'))
    loadIndexed(root, { force: true })
    const file = join(root, '日', '2026', '10', '2026-10-18.md')
    const text = readFileSync(file, 'utf8').replace('原始', '手改后的正文')
    writeFileSync(file, text, 'utf8')
    invalidate()
    const got = loadIndexed(root)
    assert.equal(got.entries.length, 1)
    assert.match(got.entries[0].text, /手改后的正文/)
    // loadEntries 也走同一索引
    assert.equal(loadEntries(root).entries.length, 1)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})
