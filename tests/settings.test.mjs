/**
 * 设置覆盖：白名单、深合并、写入/读取、与行配置合并。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { resolveConfig } from '../memory/config.js'
import { deepMerge, mergeConfig, readSettings, sanitizeSettings, writeSettings } from '../memory/settings.js'
import { ensureTree, resolveRoot } from '../memory/store.js'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-settings-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

test('白名单与深合并：只保留面板字段，行配置不动', () => {
  const sanitized = sanitizeSettings({
    siyuan: { enabled: true, baseURL: 'http://x:6806', token: 'secret', junk: 1 },
    backup: { intervalMinutes: 15 },
    dream: { time: '22:00' },
    hitTopK: 3,
    evil: true,
  })
  assert.deepEqual(sanitized, {
    siyuan: { enabled: true, baseURL: 'http://x:6806' },
    backup: { intervalMinutes: 15 },
    dream: { time: '22:00' },
    hitTopK: 3,
  })
  assert.equal(JSON.stringify(sanitized).includes('secret'), false)

  const merged = mergeConfig(
    { siyuan: { enabled: false, notebook: '旧本子' }, dream: { time: '23:30:00' } },
    sanitized,
  )
  assert.equal(merged.siyuan.enabled, true)
  assert.equal(merged.siyuan.notebook, '旧本子')
  assert.equal(merged.dream.time, '22:00')
  assert.equal(deepMerge({ a: 1 }, { b: 2 }).a, 1)
})

test('写入 settings.json 后读回，resolveConfig 生效', () => {
  const { dir, root } = setup()
  try {
    const result = writeSettings(root, {
      siyuan: { enabled: false, baseURL: 'http://127.0.0.1:6806', notebook: '93-昔涟' },
      backup: { intervalMinutes: 45, keep: 5 },
    })
    assert.equal(result.ok, true)
    const saved = readSettings(root)
    assert.equal(saved.backup.intervalMinutes, 45)
    const config = resolveConfig(mergeConfig({}, saved))
    assert.equal(config.siyuan.enabled, false)
    assert.equal(config.siyuan.baseURL, 'http://127.0.0.1:6806')
    assert.equal(config.backup.intervalMinutes, 45)
    assert.equal(config.backup.keep, 5)

    // 再写一次是合并，不是覆盖。
    writeSettings(root, { dream: { time: '22:15' } })
    const again = readSettings(root)
    assert.equal(again.backup.intervalMinutes, 45)
    assert.equal(again.dream.time, '22:15')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
