/**
 * 开新卷 CLI：确认闸、dry-run、真实开卷。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree, resolveRoot } from '../memory/store.js'
import { readVolumeState } from '../runtime/volume.mjs'
import { resolveRootFromArgs, runNewVolume } from '../scripts/new-volume.mjs'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-new-volume-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

test('没有 --confirm 时拒绝开卷，不写文件', () => {
  const { dir, root } = setup()
  try {
    const result = runNewVolume({ root })
    assert.equal(result.ok, false)
    assert.match(result.error, /confirm/)
    assert.equal(readVolumeState(root).current, 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('dry-run 只预览；confirm 后写入卷 1 与人格快照', () => {
  const { dir, root } = setup()
  try {
    const preview = runNewVolume({ root, confirm: 'new-volume', dryRun: true, reason: '测试' })
    assert.equal(preview.ok, true)
    assert.equal(preview.preview.next, 1)
    assert.equal(readVolumeState(root).current, 0)

    const result = runNewVolume({ root, confirm: 'new-volume', reason: '调整说话方式' })
    assert.equal(result.ok, true)
    assert.equal(result.id, 1)
    assert.equal(result.hash.length, 64)
    assert.equal(fs.existsSync(path.join(root, '元', '卷', '1', 'persona', 'chat.md')), true)
    const state = readVolumeState(root)
    assert.equal(state.current, 1)
    assert.equal(state.volumes[1].reason, '调整说话方式')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('resolveRootFromArgs 使用显式 root', () => {
  const root = resolveRootFromArgs({ root: 'E:/tmp/example-root' })
  assert.match(root.replace(/\\/g, '/'), /example-root$/)
})

