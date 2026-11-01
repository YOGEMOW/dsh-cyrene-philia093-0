import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree } from '../memory/store.js'
import { summarizeAnchorBlocks } from '../host/anchor-summary.mjs'

test('锚点语义摘要器：调用模型、截到 15 字、按原文缓存', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-anchor-summary-'))
  const root = path.join(dir, 'cyrene-philia093-0')
  ensureTree(root)
  try {
    let calls = 0
    const ctx = {
      get(name) {
        if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake', model: 'm' }) }
        if (name === 'llm') {
          return {
            async *stream() {
              calls += 1
              yield { type: 'text-delta', text: '["第一条概括","第二条概括"]' }
              yield { type: 'finish', reason: { kind: 'stop' } }
            },
          }
        }
        return undefined
      },
    }
    const blocks = ['卷·2026-10-22：第一条很长的原文', '卷·2026-10-23：第二条很长的原文']
    const first = await summarizeAnchorBlocks(ctx, root, blocks)
    assert.equal(first.get(blocks[0]), '第一条概括')
    assert.equal(first.get(blocks[1]), '第二条概括')
    assert.equal(calls, 1)
    const second = await summarizeAnchorBlocks(ctx, root, blocks)
    assert.equal(second.get(blocks[0]), '第一条概括')
    assert.equal(calls, 1, '第二次应命中缓存，不再调模型')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('锚点语义摘要器：模型不可用时返回空 Map（调用方回退确定性摘要）', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-anchor-summary-'))
  const root = path.join(dir, 'cyrene-philia093-0')
  ensureTree(root)
  try {
    const map = await summarizeAnchorBlocks({ get: () => undefined }, root, ['卷·2026-10-22：原文'])
    assert.equal(map.size, 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
