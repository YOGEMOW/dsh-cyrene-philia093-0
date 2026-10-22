/**
 * 思源恢复 CLI：参数解析、配置优先级、报表格式、force 安全闸。
 * 真实网络回灌由 tests/memory-restore.test.mjs 覆盖解析/写入逻辑。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { buildConfig, formatReport, parseArgs, runRestore } from '../scripts/restore-siyuan.mjs'

test('parseArgs：布尔开关与带值参数', () => {
  const args = parseArgs(['--dry-run', '--force', '--yes', '--notebook', '93-昔涟', '--base', 'http://127.0.0.1:6806'])
  assert.equal(args.dryRun, true)
  assert.equal(args.force, true)
  assert.equal(args.yes, true)
  assert.equal(args.notebook, '93-昔涟')
  assert.equal(args.base, 'http://127.0.0.1:6806')
})

test('buildConfig：settings.json 打底，命令行覆盖', () => {
  const cfg = buildConfig(
    { notebook: 'CLI本子' },
    { siyuan: { enabled: false, baseURL: 'http://x:6806', notebook: 'settings本子', rootHPath: '/旧根' } },
  )
  assert.equal(cfg.enabled, false)
  assert.equal(cfg.baseURL, 'http://x:6806')
  assert.equal(cfg.notebook, 'CLI本子')
  assert.equal(cfg.rootHPath, '/旧根')
})

test('formatReport：人类可读摘要', () => {
  const text = formatReport({
    ok: false,
    notebook: '93-昔涟',
    docs: { days: 5, anchors: 4, journals: 2 },
    entries: { added: 3, skipped: 10 },
    anchors: { restored: 0 },
    journals: { restored: 1 },
    errors: ['连接思源失败'],
  })
  assert.match(text, /有错误/)
  assert.match(text, /日档 5 篇/)
  assert.match(text, /新增 3/)
  assert.match(text, /错误：连接思源失败/)
})

test('runRestore：--force 无 --yes 时不执行', async () => {
  const report = await runRestore({ force: true, yes: false })
  assert.equal(report.notRun, true)
  assert.match(report.errors[0], /--yes/)
})
