/**
 * 月检 / 年检 / 待定提升测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { appendEntry, ensureTree, resolveRoot, readDay } from '../memory/store.js'
import { normalizeEntry } from '../memory/parse.js'
import { loadEntries } from '../memory/entries.js'
import { listPending } from '../memory/pending.mjs'
import { writeThroughGate } from '../runtime/wuyu.mjs'
import { pendingReport, promotePending, runMonthlyReview, runYearlyReview, wuyuStats } from '../runtime/review.mjs'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-review-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

const writeDayEntry = (root, overrides = {}) => writeThroughGate(root, {
  text: '用户喜欢先看结论',
  kind: 'fact',
  axis: '智',
  q: '你',
  kw: ['偏好'],
  src: 'conv',
  src_quote: '以后先说结论',
  ...overrides,
})

test('待定清单：给出「还差什么」；补齐后可提升进日档', () => {
  const { dir, root } = setup()
  try {
    const pending = writeThroughGate(root, { text: '她好像不太高兴', kind: 'fact', axis: '智' })
    assert.equal(pending.gate, 'pending')
    const report = pendingReport(root)
    assert.equal(report.length, 1)
    assert.match(report[0].reasons.join(), /溯源/)
    assert.equal(report[0].ready, false)

    const refused = promotePending(root, report[0].id, {})
    assert.equal(refused.ok, false)

    const promoted = promotePending(root, report[0].id, { src_quote: '她今天没怎么说话' })
    assert.equal(promoted.ok, true)
    assert.equal(listPending(root).entries.length, 0)
    const entries = loadEntries(root).entries
    assert.equal(entries.length, 1)
    assert.equal(entries[0].gate, 'promoted')
    assert.equal(typeof entries[0].source_ref, 'string')
    assert.equal(entries[0].src_quote, '她今天没怎么说话')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('五育统计：无源 / 孤岛 / 握命 / 天性', () => {
  const { dir, root } = setup()
  try {
    writeDayEntry(root, { text: '有源的事实', src_quote: '原话' })
    // 模拟历史/导入的无源条目（闸门之后不应出现；这里直接落盘以测统计口径）。
    appendEntry(root, normalizeEntry({
      text: '无源的事实',
      axis: '智',
      q: '你',
      src_quote: '',
      day: '2026-10-03',
    }, { now: 1792000000000 }))
    writeDayEntry(root, {
      text: '为握命养出「认真」',
      kind: 'decision',
      axis: '劳',
      src_quote: '我认真一次',
      consequence: { self: '多花时间' },
      aim: '把选择写进命运',
      nature: { name: '认真', tier: 'high', serves_aim: true },
    })
    const stats = wuyuStats(loadEntries(root).entries)
    assert.equal(stats.rows, 3)
    assert.equal(stats.noSource, 1)
    assert.equal(stats.orphanRate, 1)
    assert.equal(stats.aim, 1)
    assert.equal(stats.natureHigh, 1)
    assert.equal(stats.axes.劳, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('月检：对上一自然月出五育体检并写年轮；返回待定清单', () => {
  const { dir, root } = setup()
  try {
    const now = new Date(2026, 10, 15, 12, 0, 0).getTime() // 2026-11-15
    writeThroughGate(root, {
      text: '十月的记忆',
      kind: 'fact',
      axis: '体',
      src_quote: '十月说的',
      day: '2026-10-02',
      created_at: new Date(2026, 9, 2, 12, 0, 0).getTime(),
    })
    writeThroughGate(root, { text: '没来源的十一月事', kind: 'fact', axis: '智' })
    const result = runMonthlyReview(root, now)
    assert.equal(result.month, '2026-11')
    assert.equal(result.audit.ok, true)
    assert.equal(result.audit.empty, undefined)
    assert.equal(result.pending.length, 1)
    const yearFile = path.join(root, '年', '2026.md')
    assert.equal(fs.existsSync(yearFile), true)
    assert.match(fs.readFileSync(yearFile, 'utf8'), /五育体检 2026-10/)
    // 幂等：同月第二次跳过
    const again = runMonthlyReview(root, now)
    assert.equal(again.audit.skipped, true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('年检：返回年份、统计与待定清单', () => {
  const { dir, root } = setup()
  try {
    writeDayEntry(root)
    const result = runYearlyReview(root, new Date(2026, 11, 31).getTime())
    assert.equal(result.year, '2026')
    assert.equal(result.stats.rows >= 1, true)
    assert.equal(Array.isArray(result.pending), true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
