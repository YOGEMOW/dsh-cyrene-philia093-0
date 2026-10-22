import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ensureTree } from '../memory/store.js'
import { fsOp } from '../memory/fsops.js'

function tmpRoot() {
  return join(mkdtempSync(join(tmpdir(), 'ope-fs-')), 'cyrene-philia093-0')
}

test('余页：可写/读/列/删，且不越界', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const w = fsOp(root, 'write', '余页/笔记/想法.md', '# 想法\n今天想到一个点子', { quotaMB: 128, freeQuotaMB: 64 })
    assert.equal(w.ok, true)
    assert.ok(existsSync(join(root, '余页', '笔记', '想法.md')))
    const r = fsOp(root, 'read', '余页/笔记/想法.md', '', { quotaMB: 128, freeQuotaMB: 64 })
    assert.match(r.text, /一个点子/)
    const ls = fsOp(root, 'ls', '余页/笔记', '', { quotaMB: 128, freeQuotaMB: 64 })
    assert.match(ls.text, /想法\.md/)
    const rm = fsOp(root, 'rm', '余页/笔记/想法.md', '', { quotaMB: 128, freeQuotaMB: 64 })
    assert.equal(rm.ok, true)
    // 写非余页拒绝
    const denied = fsOp(root, 'write', '日/2026/10/x.md', 'hi', { quotaMB: 128, freeQuotaMB: 64 })
    assert.equal(denied.ok, false)
    // 越界拒绝
    const escape = fsOp(root, 'read', '../outside.md', '', { quotaMB: 128, freeQuotaMB: 64 })
    assert.equal(escape.ok, false)
    // 元/ 不对 AI 开放
    const meta = fsOp(root, 'ls', '元', '', { quotaMB: 128, freeQuotaMB: 64 })
    assert.equal(meta.ok, false)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('余页子配额：超过 freeQuotaMB 拒绝写入并提示清理', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const big = 'x'.repeat(900 * 1024) // 0.9 MB
    const ok = fsOp(root, 'write', '余页/草稿1.md', big, { quotaMB: 128, freeQuotaMB: 1 })
    assert.equal(ok.ok, true)
    const again = fsOp(root, 'write', '余页/草稿2.md', big, { quotaMB: 128, freeQuotaMB: 1 })
    assert.equal(again.ok, false)
    assert.match(again.text, /余页已满/)
    assert.equal(existsSync(join(root, '余页', '草稿2.md')), false)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('单文件 ≤1MB：超限拒绝', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const huge = 'y'.repeat(1024 * 1024 + 10)
    const r = fsOp(root, 'write', '余页/大文件.md', huge, { quotaMB: 128, freeQuotaMB: 64 })
    assert.equal(r.ok, false)
    assert.match(r.text, /1 MB/)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('du/stat 显示余页额度', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    fsOp(root, 'write', '余页/a.md', 'hello', { quotaMB: 128, freeQuotaMB: 64 })
    const du = fsOp(root, 'du', '', '', { quotaMB: 128, freeQuotaMB: 64 })
    assert.match(du.text, /余页额度/)
    const stat = fsOp(root, 'stat', '', '', { quotaMB: 128, freeQuotaMB: 64 })
    assert.match(stat.text, /余页/)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})
