/**
 * 记忆工具测试：工具可注册、写入走闸门、检索/读/联结/锚点/余页/归档可用。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree, resolveRoot, readDay, listDays } from '../memory/store.js'
import { loadEntries } from '../memory/entries.js'
import { listPending } from '../memory/pending.mjs'
import { createMemoryTools } from '../runtime/tools.mjs'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-tools-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  const tools = createMemoryTools({ root, config: {} })
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
  return { dir, root, tools, byName }
}

test('工具清单：memory_* + remember/forget，全部有 schema/output/execute', () => {
  const { dir, tools } = setup()
  try {
    const names = tools.map((tool) => tool.name)
    for (const expected of [
      'memory_write', 'memory_search', 'memory_read', 'memory_recall', 'memory_update',
      'memory_forget', 'memory_link', 'memory_anchor', 'memory_fs', 'remember', 'forget',
    ]) {
      assert.ok(names.includes(expected), `缺少工具 ${expected}`)
    }
    for (const tool of tools) {
      assert.equal(typeof tool.description, 'string')
      assert.equal(tool.parameters.type, 'object')
      assert.equal(typeof tool.execute, 'function')
      assert.equal(tool.output.render({}, 'x')[0].type, 'text')
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('memory_write：过闸进日档，id 可读；不过进待定', () => {
  const { dir, root, byName } = setup()
  try {
    const ok = byName.memory_write.execute({
      text: '用户喜欢先看结论',
      kind: 'fact',
      axis: '智',
      q: '你',
      src_quote: '以后先说结论',
    })
    assert.match(ok, /已记住/)
    const entries = loadEntries(root).entries
    assert.equal(entries.length, 1)
    const id = entries[0].id
    assert.match(byName.memory_read.execute({ id }), /用户喜欢先看结论/)

    const bad = byName.memory_write.execute({ text: '没来源的猜测', kind: 'fact', axis: '智' })
    assert.match(bad, /待定/)
    assert.equal(listPending(root).entries.length, 1)
    assert.equal(loadEntries(root).entries.length, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('memory_search / recall / link / anchor / fs / forget', () => {
  const { dir, root, byName } = setup()
  try {
    const a = byName.memory_write.execute({
      text: '用户对猫毛过敏',
      kind: 'fact',
      axis: '体',
      q: '你',
      kw: ['过敏', '猫'],
      src_quote: '我对猫毛过敏',
    })
    const b = byName.memory_write.execute({
      text: '用户把「握命」理解为把选择写进命运',
      kind: 'fact',
      axis: '劳',
      q: '你',
      kw: ['握命', '选择'],
      src_quote: '握命就是把选择写进命运',
    })
    assert.match(a, /已记住/)
    assert.match(b, /已记住/)
    const entries = loadEntries(root).entries
    assert.equal(entries.length, 2)
    const [first, second] = entries

    assert.match(byName.memory_search.execute({ query: '猫毛过敏' }), /过敏/)
    assert.match(byName.memory_recall.execute({ query: '握命' }), /记忆|锚/)

    assert.match(byName.memory_link.execute({ from: first.id, to: second.id, type: '相似' }), /已建立联结/)
    assert.equal(loadEntries(root).entries.find((entry) => entry.id === first.id).links.length, 1)

    assert.match(byName.memory_anchor.execute({ which: 'self', content: '我是昔涟' }), /已更新/)
    assert.match(byName.memory_anchor.execute({}), /昔涟/)

    assert.match(byName.memory_fs.execute({ op: 'write', path: '余页/草稿/想法.md', content: '一页草稿' }), /已写入|ok|成功/i)
    assert.match(byName.memory_fs.execute({ op: 'read', path: '余页/草稿/想法.md' }), /一页草稿/)

    assert.match(byName.memory_forget.execute({ id: first.id }), /已归档/)
    assert.match(byName.memory_forget.execute({ query: '握命' }), /已归档/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('remember/forget 简写可用', () => {
  const { dir, root, byName } = setup()
  try {
    assert.match(byName.remember.execute({ text: '周六一起走旧街' }), /已记住/)
    assert.equal(loadEntries(root).entries.length, 1)
    assert.match(byName.forget.execute({ keyword: '旧街' }), /已归档/)
    assert.equal(loadEntries(root).entries[0].status, 'archived')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
