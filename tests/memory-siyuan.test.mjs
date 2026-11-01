import { test } from 'node:test'
import assert from 'node:assert/strict'

import { archiveHPath, normalizeArchiveBody, normalizeJournalBody } from '../memory/siyuan.js'

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

test('月/年档 hpath 与正文归一', () => {
  const cfg = { rootHPath: '/一页永恒' }
  assert.equal(archiveHPath(cfg, 'month', '2026-10'), '/一页永恒/月/2026/2026-10 · 月档')
  assert.equal(archiveHPath(cfg, 'year', '2026'), '/一页永恒/年/2026 · 年轮')

  const raw = '---\nmonth: 2026-10\nentries: 3\n---\n\n# 2026-10 · 月档\n\n## 主题：德（1 条）\n\n- [I8] 内容\n'
  const body = normalizeArchiveBody(raw)
  assert.equal(body.startsWith('---'), false)
  assert.equal(body.startsWith('# '), false)
  assert.match(body, /^## 主题：德/)
  assert.match(body, /内容/)
})