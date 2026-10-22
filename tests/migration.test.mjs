/**
 * 迁移演练（合成数据）：导入幂等、旧目录复制、配置迁移、源数据不动。
 * 不读取真实 ~/.dsh。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { listDays, readDay } from '../memory/store.js'
import { runImport } from '../scripts/import.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name) => path.join(here, 'fixtures', 'baseline', name)

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-mig-'))
  const home = path.join(dir, 'home')
  fs.mkdirSync(home, { recursive: true })
  fs.copyFileSync(fixture('legacy-memory.sample.md'), path.join(home, 'cyrene-memory.md'))
  const eternal = path.join(home, 'cyrene-eternal-page-remembrance')
  fs.mkdirSync(path.join(eternal, '日', '2026', '10'), { recursive: true })
  fs.copyFileSync(fixture('eternal-day.sample.md'), path.join(eternal, '日', '2026', '10', '2026-10-18.md'))
  fs.writeFileSync(path.join(home, 'dsha-brand-rename.json'), JSON.stringify({ nickname: '阿泽' }), 'utf8')
  return { dir, home, root: path.join(home, 'cyrene-philia093-0') }
}

test('迁移：首次导入 → 幂等重跑 → 报告/卷/配置齐全；源数据不动', () => {
  const { dir, home, root } = setup()
  try {
    const legacyBefore = fs.readFileSync(path.join(home, 'cyrene-memory.md'), 'utf8')
    const first = runImport({ home, quiet: true })
    assert.equal(first.errors.length, 0)
    assert.equal(first.copied, 1)
    assert.equal(first.imported, 3)
    assert.equal(first.duplicated, 0)
    assert.ok(fs.existsSync(path.join(root, '元', '卷.json')))
    assert.ok(fs.existsSync(path.join(root, '元', '迁移报告.md')))
    assert.ok(fs.existsSync(path.join(root, '元', 'nickname.json')))

    // 旧日档被复制进来。
    assert.equal(listDays(root).includes('2026-10-18'), true)
    // 导入条目在日档里，带 legacy 来源。
    const imported = []
    for (const day of listDays(root)) {
      for (const entry of readDay(root, day).entries) {
        if ((entry.src_ids ?? []).some((id) => String(id).startsWith('legacy:'))) imported.push(entry)
      }
    }
    assert.equal(imported.length, 3)
    assert.equal(imported.every((entry) => entry.src === 'import' && entry.gate === 'imported'), true)

    const second = runImport({ home, quiet: true })
    assert.equal(second.imported, 0)
    assert.equal(second.duplicated, 3)
    assert.equal(second.copied, 0)

    // 源数据一个字都没动。
    assert.equal(fs.readFileSync(path.join(home, 'cyrene-memory.md'), 'utf8'), legacyBefore)
    assert.ok(fs.existsSync(path.join(home, 'cyrene-eternal-page-remembrance', '日', '2026', '10', '2026-10-18.md')))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('迁移：dry-run 不落盘', () => {
  const { dir, home, root } = setup()
  try {
    const summary = runImport({ home, dryRun: true, quiet: true })
    assert.equal(summary.imported, 3)
    assert.equal(fs.existsSync(root), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
