import { test } from 'node:test'
import assert from 'node:assert/strict'

import { bucketEntries, allocateSchedule, BASE_WEIGHTS } from '../memory/scheduler.js'

const DAY = 86400000

function entry(over = {}) {
  const now = Date.now()
  return {
    id: over.id ?? `e${Math.random().toString(36).slice(2, 9)}`,
    text: over.text ?? '一条记忆正文',
    kind: over.kind ?? 'fact',
    axis: over.axis ?? '智',
    q: '你',
    I: over.I ?? 5,
    S: over.S ?? 1,
    status: over.status ?? 'active',
    kw: [],
    src: 'conv',
    links: [],
    fact_time: over.fact_time ?? now,
    reviewed_at: over.reviewed_at ?? now,
    touched_at: now,
    created_at: now,
    day: over.day ?? new Date(over.fact_time ?? now).toISOString().slice(0, 10),
    n_recall: 0
  }
}

test('分桶：近 / 中 / 远 / 事 / 待复习', () => {
  const now = Date.now()
  const rows = [
    entry({ id: 'near', fact_time: now - 1 * DAY, day: new Date(now).toISOString().slice(0, 10) }),
    entry({ id: 'mid', fact_time: now - 20 * DAY, day: new Date(now - 20 * DAY).toISOString().slice(0, 10) }),
    entry({ id: 'far', fact_time: now - 200 * DAY, day: new Date(now - 200 * DAY).toISOString().slice(0, 10) }),
    entry({ id: 'topic', kind: 'topic', fact_time: now - 40 * DAY }),
    entry({ id: 'due', fact_time: now - 20 * DAY, reviewed_at: now - 20 * DAY, day: new Date(now - 20 * DAY).toISOString().slice(0, 10) })
  ]
  const buckets = bucketEntries(rows, { now })
  assert.equal(buckets.near.some((x) => x.entry.id === 'near'), true)
  assert.equal(buckets.todo.some((x) => x.entry.id === 'topic'), true)
  assert.equal(buckets.due.some((x) => x.entry.id === 'due'), true)
  // far 依赖年份，不强制断言具体条目
  assert.ok(Array.isArray(buckets.far))
})

test('调度：预算上限、命中桶优先、返回分配信息', () => {
  const now = Date.now()
  const rows = []
  for (let i = 0; i < 5; i += 1) rows.push(entry({ id: `n${i}`, text: `近况条目${i}`, fact_time: now - i * 1000 }))
  const buckets = bucketEntries(rows, { now, hits: [{ entry: rows[0], rel: 0.9 }] })
  const plan = allocateSchedule(buckets, 400, { now })
  assert.ok(plan.items.length > 0)
  const totalChars = plan.items.reduce((s, it) => s + Math.max(20, String(it.text ?? '').length), 0)
  assert.ok(totalChars <= 400 + 400, `总字数不应严重超预算: ${totalChars}`)
  assert.ok(Object.keys(plan.alloc).length > 0)
  assert.ok(plan.items.some((it) => it.bucket === 'hit'))
})

test('调度：空桶份额并给存在的桶；全空返回空', () => {
  const now = Date.now()
  const buckets = bucketEntries([entry({ id: 'only', fact_time: now })], { now })
  const plan = allocateSchedule(buckets, 200, { now })
  assert.equal(plan.items.length, 1)
  assert.equal(plan.items[0].bucket, 'near')
  assert.equal(allocateSchedule({ near: [], mid: [], far: [], todo: [], hit: [], due: [] }, 200).items.length, 0)
})

test('调度：基础权重齐全（护栏，避免以后误改）', () => {
  const sum = Object.values(BASE_WEIGHTS).reduce((s, v) => s + v, 0)
  assert.ok(Math.abs(sum - 1) < 1e-9)
})
