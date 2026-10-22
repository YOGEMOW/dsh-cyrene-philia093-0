/**
 * 定时维护测试：思源关闭时不发网络请求；快照/月度体检可跑；状态可读。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree, resolveRoot } from '../memory/store.js'
import { resolveConfig } from '../memory/config.js'
import { installMaintenance } from '../host/maintenance.mjs'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-maint-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

test('维护：思源关闭 + 快照强制时点 → runOnce 成功并生成快照', async () => {
  const { dir, root } = setup()
  let dispose = () => {}
  try {
    const ctx = { logger: { info() {}, warn() {} } }
    const service = {
      root,
      config: resolveConfig({
        siyuan: { enabled: false },
        backup: { enabled: true, intervalMinutes: 30, snapshotHour: 0, keep: 7 },
        dream: { enabled: false },
      }),
      diagnostics: {},
    }
    dispose = installMaintenance(ctx, service)
    assert.equal(service.maintenance.status().siyuan.enabled, false)
    const result = await service.maintenance.runOnce('test')
    assert.equal(result.mirror.skipped, true)
    assert.equal(result.backup.ok, true)
    const snapshots = path.join(path.dirname(root), 'cyrene-philia093-0-snapshots')
    assert.equal(fs.existsSync(snapshots), true)
    assert.equal(fs.existsSync(path.join(root, '元', '维护.log')), true)
  } finally {
    dispose()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('维护：备份关闭时 runBackup 跳过', async () => {
  const { dir, root } = setup()
  let dispose = () => {}
  try {
    const service = {
      root,
      config: resolveConfig({ backup: { enabled: false }, dream: { enabled: false } }),
      diagnostics: {},
    }
    dispose = installMaintenance({ logger: { info() {}, warn() {} } }, service, { enabled: false })
    const result = await service.maintenance.runOnce('test')
    assert.equal(result.backup.skipped, true)
  } finally {
    dispose()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
