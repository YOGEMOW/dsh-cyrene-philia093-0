import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree, readAnchor, writeAnchor } from '../memory/store.js'
import { compactAnchor, readAnchors } from '../memory/anchor.js'
import { anchorChangeAllowed, recordAnchorChange } from '../memory/audit.js'

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-anchor-life-'))
  const root = path.join(dir, 'cyrene-philia093-0')
  ensureTree(root)
  return { dir, root }
}

test('锚点生命周期：超过 420 字时把旧「卷·日期」归档到 锚/历史/，可重复执行', () => {
  const { dir, root } = setup()
  try {
    const blocks = Array.from({ length: 6 }, (_, i) => `卷·2026-10-${String(10 + i).padStart(2, '0')}：${'经历'.repeat(30)}`)
    const content = ['我是谁：一个正在学习的人。', ...blocks].join('\n\n')
    writeAnchor(root, 'self', content, { version: 1, updated_at: Date.now(), immutable: false })
    const result = compactAnchor(root, 'self')
    assert.equal(result.compacted, true)
    assert.ok(result.after <= 420, `压缩后 ${result.after} 字仍超限`)
    const anchor = readAnchor(root, 'self')
    assert.match(anchor.content, /更早的卷：锚\/历史\/self\//)
    assert.equal(anchor.content.includes(blocks[0]), false)
    assert.equal(anchor.meta.version, 1, '压缩不应改变版本')
    const historyFiles = fs.readdirSync(path.join(root, '锚', '历史', 'self'))
    assert.ok(historyFiles.length > 0)
    assert.match(fs.readFileSync(path.join(root, '锚', '历史', 'self', historyFiles[0]), 'utf8'), /卷·2026-10-10/)
    const again = compactAnchor(root, 'self')
    assert.equal(again.compacted, false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('锚点限额：同一天第二次写入被 anchorChangeAllowed 拦住', () => {
  const { dir, root } = setup()
  try {
    const now = Date.now()
    assert.equal(anchorChangeAllowed(root, 'self', now).ok, true)
    recordAnchorChange(root, 'self', now)
    const gate = anchorChangeAllowed(root, 'self', now + 1000)
    assert.equal(gate.ok, false)
    assert.match(gate.reason, /最多改/)
    // 其他锚点不受影响
    assert.equal(anchorChangeAllowed(root, 'user', now + 1000).ok, true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('历史只在真正压缩时产生；短锚点不动', () => {
  const { dir, root } = setup()
  try {
    writeAnchor(root, 'goal', '去往一个能安静写东西的地方。', { version: 1, updated_at: Date.now(), immutable: false })
    const result = compactAnchor(root, 'goal')
    assert.equal(result.compacted, false)
    assert.equal(fs.existsSync(path.join(root, '锚', '历史', 'goal')), false)
    assert.equal(readAnchors(root).goal.content, '去往一个能安静写东西的地方。')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
