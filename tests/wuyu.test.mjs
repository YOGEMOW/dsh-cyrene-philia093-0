/**
 * 五育闸门 + 待定区测试（第 4 步核心）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree, resolveRoot, readDay } from '../memory/store.js'
import { appendPending, listPending, pendingCount, readPendingDay, removePending } from '../memory/pending.mjs'
import { normalizeEntry } from '../memory/parse.js'
import { assessWrite, writeThroughGate } from '../runtime/wuyu.mjs'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-wuyu-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

const valid = (root) => ({
  text: '答应周末陪她走完旧街',
  kind: 'fact',
  axis: '德',
  q: '你',
  src: 'conv',
  src_quote: '周六我不排事了，陪你走。',
  root,
})

test('评估：无源 / 无五育 / 决策无后果 / 基座 → 不过；齐全 → 过', () => {
  const { dir, root } = setup()
  try {
    assert.equal(assessWrite({ ...valid(root), src_quote: '', src_ids: [] }).ok, false)
    assert.match(assessWrite({ ...valid(root), src_quote: '', src_ids: [] }).reasons.join(), /溯源/)
    assert.equal(assessWrite({ ...valid(root), axis: undefined }).ok, false)
    assert.match(assessWrite({ ...valid(root), kind: 'decision' }).reasons.join(), /后果/)
    assert.equal(assessWrite({ ...valid(root), base: true }).ok, false)
    const full = assessWrite({
      ...valid(root),
      kind: 'decision',
      consequence: { self: '少一次会', future: '同类选择会被参照' },
    })
    assert.equal(full.ok, true)
    assert.equal(full.entry.axis, '德')
    assert.equal(full.entry.kind, 'decision')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('写入：过闸进日档；不过进待定区；日档里没有无源条目', () => {
  const { dir, root } = setup()
  try {
    const day = writeThroughGate(root, valid(root))
    assert.equal(day.ok, true)
    assert.equal(day.gate, 'day')
    const parsed = readDay(root, day.day)
    assert.equal(parsed.entries.length, 1)
    assert.equal(parsed.entries[0].text, '答应周末陪她走完旧街')

    const pending = writeThroughGate(root, {
      text: '她好像不太高兴',
      kind: 'fact',
      axis: '智',
      src: 'conv',
      // 没有溯源
    })
    assert.equal(pending.ok, false)
    assert.equal(pending.gate, 'pending')
    assert.match(pending.message, /待定/)
    assert.equal(pendingCount(root), 1)
    const pendingEntries = listPending(root).entries
    assert.equal(pendingEntries.length, 1)
    assert.equal(pendingEntries[0].gate, 'pending')

    // 日档仍只有一条，且已过闸。
    assert.equal(readDay(root, day.day).entries.length, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('待定区：追加幂等、按日读取、移除', () => {
  const { dir, root } = setup()
  try {
    const entry = normalizeEntry({ text: '无源的事', axis: '智', gate: 'pending', day: '2026-10-22' }, { now: 1792000000000 })
    assert.equal(appendPending(root, entry).ok, true)
    assert.equal(appendPending(root, entry).ok, true)
    assert.equal(readPendingDay(root, '2026-10-22').entries.length, 1)
    assert.equal(removePending(root, entry.id).ok, true)
    assert.equal(pendingCount(root), 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('卷号：写入带 vol（元/卷.json 缺省 0）', () => {
  const { dir, root } = setup()
  try {
    const result = writeThroughGate(root, valid(root))
    assert.equal(result.ok, true)
    const entry = readDay(root, result.day).entries[0]
    assert.equal(entry.vol, 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
