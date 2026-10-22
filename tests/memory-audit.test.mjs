import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  noteInjection,
  noteUserTurn,
  loadAudit,
  effectiveHitTopK,
  monthlyAudit,
  anchorChangeAllowed,
  recordAnchorChange
} from '../memory/audit.js'
import { ensureTree } from '../memory/store.js'

function tmpRoot() {
  return join(mkdtempSync(join(tmpdir(), 'ope-audit-')), 'cyrene-philia093-0')
}

test('注入利用率：关键词再现记为用上', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = Date.now()
    noteInjection(root, { ids: ['a', 'b'], kws: ['星穹铁道', '博物馆'], now })
    assert.equal(loadAudit(root).injections.at(-1).used, false)
    const r = noteUserTurn(root, '最近又在弄星穹铁道的活动', now + 1000)
    assert.equal(r.used, 1)
    const audit = loadAudit(root)
    assert.equal(audit.injections.at(-1).used, true)
    assert.equal(audit.stats.total, 1)
    assert.equal(audit.stats.used, 1)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('注入利用率：样本 ≥20 且 <30% 时收缩命中额度', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = Date.now()
    for (let i = 0; i < 20; i += 1) {
      noteInjection(root, { ids: [`id${i}`], kws: [`关键词${i}`], now: now - i * 1000 })
    }
    // 只有 1 次被用上 → rate 0.05
    noteUserTurn(root, '关键词0', now)
    assert.equal(loadAudit(root).stats.rate < 0.3, true)
    assert.equal(effectiveHitTopK(root, 2), 1)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('月度五育体检：上月有数据才写，且只写一次', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = new Date(2026, 10, 5, 4, 0, 0).getTime() // 2026-11-05 → 体检 2026-10
    const entries = [
      { day: '2026-10-02', axis: '德', src_quote: '原话', links: ['x|相似'], status: 'active' },
      { day: '2026-10-03', axis: '智', src_quote: '', links: [], status: 'archived' }
    ]
    const first = monthlyAudit(root, entries, now)
    assert.equal(first.ok, true)
    assert.equal(first.rows, 2)
    const file = join(root, '年', '2026.md')
    assert.ok(existsSync(file))
    assert.match(readFileSync(file, 'utf8'), /五育体检 2026-10/)
    const second = monthlyAudit(root, entries, now + 1000)
    assert.equal(second.skipped, true)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('锚点限额：24h 内重复改同一份被拒，7 天后放行', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = Date.now()
    assert.equal(anchorChangeAllowed(root, 'self', now).ok, true)
    recordAnchorChange(root, 'self', now)
    assert.equal(anchorChangeAllowed(root, 'self', now + 1000).ok, false)
    assert.equal(anchorChangeAllowed(root, 'self', now + 25 * 60 * 60 * 1000).ok, true)
    assert.equal(anchorChangeAllowed(root, 'origin', now).ok, true)
    recordAnchorChange(root, 'origin', now)
    assert.equal(anchorChangeAllowed(root, 'origin', now + 60 * 60 * 1000).ok, false)
    assert.equal(anchorChangeAllowed(root, 'origin', now + 8 * 24 * 60 * 60 * 1000).ok, true)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('锚点限额按自然日：23:35 改过，次日 23:30（相隔 23h55m）仍允许', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const t1 = Date.UTC(2026, 9, 19, 15, 35, 0) // 2026-10-19 23:35 +08
    recordAnchorChange(root, 'user', t1)
    assert.equal(anchorChangeAllowed(root, 'user', t1 + 10 * 60_000, { timeZone: 'Asia/Shanghai' }).ok, false)
    const t2 = Date.UTC(2026, 9, 20, 15, 30, 0) // 2026-10-20 23:30 +08
    assert.equal(t2 - t1, 23 * 60 * 60_000 + 55 * 60_000)
    assert.equal(anchorChangeAllowed(root, 'user', t2, { timeZone: 'Asia/Shanghai' }).ok, true)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})
