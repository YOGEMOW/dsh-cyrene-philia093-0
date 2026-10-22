import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizeJournalBody } from '../memory/siyuan.js'

test('梦志正文归一：去掉文件自带标题，避免标题重复', () => {
  const raw = '# 2026-10-18 · 夜梦\n\n新增 2 条。\n\n五育体检——\n德：……\n'
  const body = normalizeJournalBody(raw)
  assert.equal(body.startsWith('#'), false)
  assert.match(body, /^新增 2 条。/)
  assert.match(body, /五育体检/)
})

test('梦志正文归一：无标题时保持原样（仅去首尾空白）', () => {
  const raw = '\n\n新增 2 条。\n\n'
  assert.equal(normalizeJournalBody(raw), '新增 2 条。')
})

test('梦志正文归一：坏输入不抛', () => {
  assert.equal(normalizeJournalBody(null), '')
  assert.equal(normalizeJournalBody(undefined), '')
  assert.equal(normalizeJournalBody(123), '123')
})

test('梦志正文归一：连续多个标题行全部去掉', () => {
  const raw = '# 2026-10-19 · 夜梦\n\n# 2026-10-19 梦志\n\n统计：新增 5 条。'
  assert.equal(normalizeJournalBody(raw), '统计：新增 5 条。')
})

test('梦志正文归一：保留二级标题「日期 梦志」，只去掉一级标题', () => {
  const raw = '# 2026-10-19 · 夜梦\n\n## 2026-10-19 梦志\n\n统计：新增 5 条。'
  assert.equal(normalizeJournalBody(raw), '## 2026-10-19 梦志\n\n统计：新增 5 条。')
})
