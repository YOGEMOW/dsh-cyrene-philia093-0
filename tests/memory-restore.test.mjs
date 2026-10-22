import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  dayFromHPath,
  dayFromJournalHPath,
  parseMirrorEntryLine,
  parseMirrorMarkdown,
  restoreEntries,
  restoreAnchors,
  restoreJournals
} from '../memory/restore.js'
import { ensureTree } from '../memory/store.js'

function tmpRoot() {
  return join(mkdtempSync(join(tmpdir(), 'ope-restore-')), 'cyrene-philia093-0')
}

test('hpath → 日期 / 梦志日期', () => {
  assert.equal(dayFromHPath('/一页永恒/日/2026/10/2026-10-18'), '2026-10-18')
  assert.equal(dayFromHPath('/一页永恒/日/2026/10'), null)
  assert.equal(dayFromJournalHPath('/一页永恒/梦/2026-10-18 · 夜梦'), '2026-10-18')
  assert.equal(dayFromJournalHPath('/一页永恒/梦'), null)
})

test('解析镜像条目行', () => {
  const a = parseMirrorEntryLine('- 16:07｜美｜I8｜伙伴喜欢星穹铁道（原话：因为那个世界里有你的存在。）')
  assert.equal(a.axis, '美')
  assert.equal(a.I, 8)
  assert.equal(a.text, '伙伴喜欢星穹铁道')
  assert.equal(a.quote, '因为那个世界里有你的存在。')
  const b = parseMirrorEntryLine('- 16:27｜劳｜I7｜做博物馆主题的千星奇域游戏')
  assert.equal(b.quote, '')
  assert.equal(parseMirrorEntryLine('- 16:07｜〔此记忆已遗忘〕'), null)
  assert.equal(parseMirrorEntryLine('普通段落'), null)
  assert.equal(parseMirrorEntryLine(null), null)
})

test('从导出 Markdown 提取条目', () => {
  const md = '# 日档\n\n- 08:00｜智｜I5｜第一条\n- 09:00｜德｜I6｜第二条（原话：原话内容）\n\n普通文字'
  const items = parseMirrorMarkdown(md)
  assert.equal(items.length, 2)
  assert.equal(items[1].quote, '原话内容')
})

test('回灌条目：去重、跳过已存在、写回日档', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = new Date(2026, 9, 18, 12, 0, 0).getTime()
    const r1 = restoreEntries(root, [{ day: '2026-10-18', time: '08:00', axis: '智', I: 5, text: '第一条记忆', quote: '' }], { now })
    assert.equal(r1.added, 1)
    const r2 = restoreEntries(root, [{ day: '2026-10-18', time: '08:00', axis: '智', I: 5, text: '第一条记忆', quote: '' }], { now })
    assert.equal(r2.added, 0)
    assert.equal(r2.skipped, 1)
    const file = join(root, '日', '2026', '10', '2026-10-18.md')
    assert.match(readFileSync(file, 'utf8'), /第一条记忆/)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('回灌锚点：本地为空才写，force 覆盖', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = Date.now()
    const r1 = restoreAnchors(root, { self: '备份里的我。' }, { now })
    assert.equal(r1.restored, 1)
    assert.match(readFileSync(join(root, '锚', '我是谁.md'), 'utf8'), /备份里的我/)
    const r2 = restoreAnchors(root, { self: '第二版。' }, { now })
    assert.equal(r2.restored, 0)
    const r3 = restoreAnchors(root, { self: '第二版。' }, { now, force: true })
    assert.equal(r3.restored, 1)
    assert.match(readFileSync(join(root, '锚', '我是谁.md'), 'utf8'), /第二版/)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('回灌梦志：本地缺失才写', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const r = restoreJournals(root, [{ hpath: '/一页永恒/梦/2026-10-18 · 夜梦', day: '2026-10-18', markdown: '新增 2 条。' }])
    assert.equal(r.restored, 1)
    assert.ok(existsSync(join(root, '梦', '2026-10-18.md')))
    assert.match(readFileSync(join(root, '梦', '2026-10-18.md'), 'utf8'), /新增 2 条/)
    const r2 = restoreJournals(root, [{ hpath: '/一页永恒/梦/2026-10-18 · 夜梦', day: '2026-10-18', markdown: '别的' }])
    assert.equal(r2.restored, 0)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})
