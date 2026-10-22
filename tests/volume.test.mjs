/**
 * 新卷测试：只增不改、人格快照、指纹。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree, resolveRoot, writeJSON } from '../memory/store.js'
import { ensureVolumePersonaHash } from '../memory/persona.js'
import { openVolume, personaHash, readVolumeState } from '../runtime/volume.mjs'

test('默认卷 0；开新卷写入快照与指纹；可连续开卷', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-vol-'))
  try {
    const root = resolveRoot(path.join(dir, 'root'))
    ensureTree(root)
    const initial = readVolumeState(root)
    assert.equal(initial.current, 0)
    assert.equal(initial.volumes.length, 1)

    const first = openVolume(root, { reason: '第一次重开', now: 1792000000000 })
    assert.equal(first.ok, true)
    assert.equal(first.id, 1)
    assert.equal(first.hash.length, 64)
    assert.equal(fs.existsSync(path.join(root, '元', '卷', '1', 'persona', 'chat.md')), true)
    assert.equal(fs.existsSync(path.join(root, '元', '卷', '1', 'persona', 'wuyu.md')), true)

    const state = readVolumeState(root)
    assert.equal(state.current, 1)
    assert.equal(state.volumes.length, 2)
    assert.equal(state.volumes[1].reason, '第一次重开')
    assert.equal(state.volumes[1].persona_hash, personaHash())

    const second = openVolume(root, { now: 1793000000000 })
    assert.equal(second.id, 2)
    assert.equal(readVolumeState(root).current, 2)
    // 旧卷快照保留
    assert.equal(fs.existsSync(path.join(root, '元', '卷', '1', 'persona', 'chat.md')), true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('已存在的空章卷会被补上 persona_hash（迁移后第一次启动）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-stamp-'))
  try {
    const root = resolveRoot(path.join(dir, 'root'))
    ensureTree(root)
    writeJSON(path.join(root, '元', '卷.json'), {
      current: 0,
      volumes: [{ id: 0, started_at: 1, reason: 'migrated', persona_hash: '', wuyu_version: '1' }],
    })
    const first = ensureVolumePersonaHash(root)
    assert.equal(first.ok, true)
    assert.equal(first.changed, true)
    assert.equal(first.hash, personaHash())
    assert.equal(readVolumeState(root).volumes[0].persona_hash, personaHash())
    const second = ensureVolumePersonaHash(root)
    assert.equal(second.changed, false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
