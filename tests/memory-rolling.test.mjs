import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ensureTree } from '../memory/store.js'
import { rollMonthly, rollYearly, rollCalendars, buildMonthDoc } from '../memory/rolling.js'

function tmpRoot() {
  return join(mkdtempSync(join(tmpdir(), 'ope-roll-')), 'cyrene-philia093-0')
}

function entry(day, over = {}) {
  return {
    day,
    axis: over.axis ?? '智',
    I: over.I ?? 5,
    text: over.text ?? '一条记忆',
    links: over.links ?? [],
    status: 'active'
  }
}

test('月档：上月有数据才生成，重复调用不覆盖', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = new Date(2026, 10, 3, 4, 0, 0).getTime() // 2026-11-03 → 上月 2026-10
    const entries = [
      entry('2026-10-02', { axis: '德', I: 7, text: '第一次判断' }),
      entry('2026-10-18', { axis: '劳', I: 8, text: '博物馆项目' }),
      entry('2026-11-01', { axis: '智', I: 5, text: '本月条目' })
    ]
    const first = rollMonthly(root, entries, now)
    assert.equal(first.created, true)
    assert.equal(first.month, '2026-10')
    const file = join(root, '月', '2026', '2026-10.md')
    assert.ok(existsSync(file))
    const text = readFileSync(file, 'utf8')
    assert.match(text, /# 2026-10 · 月档/)
    assert.match(text, /主题：德（1 条）/)
    assert.match(text, /博物馆项目/)
    assert.equal(text.includes('本月条目'), false)
    const second = rollMonthly(root, entries, now)
    assert.equal(second.created, false)
    assert.equal(second.reason, 'exists')
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('月档：没有上月数据时跳过', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = new Date(2026, 10, 3, 4, 0, 0).getTime()
    const r = rollMonthly(root, [entry('2026-11-01')], now)
    assert.equal(r.created, false)
    assert.equal(r.reason, 'empty')
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('年轮：跨年后对上年追加一次定格，幂等', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = new Date(2026, 0, 2, 4, 0, 0).getTime() // 2026-01-02 → 上年 2025
    const entries = [
      entry('2025-03-01', { axis: '德', I: 6, text: '旧年判断' }),
      entry('2025-12-31', { axis: '智', I: 5, text: '旧年结尾', links: ['x|相似'] }),
      entry('2026-01-01', { axis: '美', I: 4, text: '新年条目' })
    ]
    const first = rollYearly(root, entries, now)
    assert.equal(first.created, true)
    const file = join(root, '年', '2025.md')
    assert.ok(existsSync(file))
    const text = readFileSync(file, 'utf8')
    assert.match(text, /# 2025 · 年轮/)
    assert.match(text, /## 年轮定格 2025/)
    assert.match(text, /五育年检/)
    assert.equal(text.includes('新年条目'), false)
    const second = rollYearly(root, entries, now)
    assert.equal(second.created, false)
    assert.equal(second.reason, 'exists')
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('年轮：非一月不做跨年滚动', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const r = rollYearly(root, [entry('2025-12-01')], new Date(2026, 5, 1).getTime())
    assert.equal(r.created, false)
    assert.equal(r.reason, 'not-january')
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('rollCalendars：一次调用同时尝试月/年', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = new Date(2026, 0, 3, 4, 0, 0).getTime()
    const entries = [entry('2025-12-20', { text: '跨年前的记忆' })]
    const r = rollCalendars(root, entries, now)
    assert.equal(r.monthly.month, '2025-12')
    assert.equal(r.monthly.created, true)
    assert.equal(r.yearly.created, true)
    assert.ok(buildMonthDoc('2025-12', entries).includes('# 2025-12 · 月档'))
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})
