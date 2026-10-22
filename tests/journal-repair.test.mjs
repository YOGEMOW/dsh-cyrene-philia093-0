/**
 * 梦志补记：dry-run、写入、跳过已有梦志、force 再补。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree, resolveRoot } from '../memory/store.js'
import { dayOf } from '../memory/dream.js'
import { repairJournals } from '../memory/journal.js'
import { writeThroughGate } from '../runtime/wuyu.mjs'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-journal-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

test('没有梦志：dry-run 不写，apply 写入补记，二次跳过', () => {
  const { dir, root } = setup()
  try {
    writeThroughGate(root, { text: '今天补了设置面板和恢复手册', kind: 'fact', axis: '智', src_quote: '补面板' })
    const day = dayOf()

    const preview = repairJournals(root, { days: 1, dryRun: true })
    assert.equal(preview.days[0].action, 'would-write')
    assert.equal(fs.existsSync(path.join(root, '梦', `${day}.md`)), false)

    const first = repairJournals(root, { days: 1 })
    assert.equal(first.written, 1)
    const file = path.join(root, '梦', `${day}.md`)
    const text = fs.readFileSync(file, 'utf8')
    assert.match(text, /按日档补上/)
    assert.match(text, /今天补了设置面板和恢复手册/)
    assert.equal(text.includes('自动摘要'), false)

    const second = repairJournals(root, { days: 1 })
    assert.equal(second.written, 0)
    assert.equal(second.days[0].action, 'skip-has-note')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('已有空壳梦志：补记追加；完整梦志默认跳过，force 才补', () => {
  const { dir, root } = setup()
  try {
    const day = dayOf()
    writeThroughGate(root, { text: '留下一条今天的记忆', kind: 'fact', axis: '美', src_quote: '记住' })
    fs.mkdirSync(path.join(root, '梦'), { recursive: true })
    const file = path.join(root, '梦', `${day}.md`)
    fs.writeFileSync(file, `# ${day} · 夜梦\n\n（自动收尾：本次整理没有写梦志，仅记录状态。）\n`, 'utf8')

    assert.equal(repairJournals(root, { days: 1 }).written, 1)
    assert.match(fs.readFileSync(file, 'utf8'), /按日档补上/)

    // 完整梦志：不 force 时跳过，force 再补一条。
    fs.writeFileSync(file, `# ${day} · 夜梦\n\n## ${day} 梦志\n\n${'真实梦志内容。'.repeat(10)}\n`, 'utf8')
    assert.equal(repairJournals(root, { days: 1 }).days[0].action, 'skip-has-journal')
    assert.equal(repairJournals(root, { days: 1, force: true }).written, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
