import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree } from '../memory/store.js'
import { migrateLayout } from '../scripts/migrate-layout.mjs'

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-migrate-layout-'))
  const root = path.join(dir, 'cyrene-philia093-0')
  ensureTree(root)
  fs.mkdirSync(path.join(root, '日', '2026', '10'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '日', '2026', '10', '2026-10-18.md'),
    '# 日档\n\n<!--cyrene:{"id":"x","path":"日/2026/10/2026-10-18.md"}-->\n',
    'utf8',
  )
  fs.mkdirSync(path.join(root, '月', '2026'), { recursive: true })
  fs.writeFileSync(path.join(root, '月', '2026', '2026-10.md'), '# 2026-10 · 月档\n', 'utf8')
  fs.mkdirSync(path.join(root, '年'), { recursive: true })
  fs.writeFileSync(path.join(root, '年', '2026.md'), '# 2026 · 年轮\n', 'utf8')
  fs.mkdirSync(path.join(root, '梦'), { recursive: true })
  fs.writeFileSync(path.join(root, '梦', '2026-10-18.md'), '# 2026-10-18 · 夜梦\n', 'utf8')
  fs.writeFileSync(path.join(root, '元', '索引.jsonl'), '{"x":1}\n', 'utf8')
  fs.writeFileSync(path.join(root, '元', '思源镜像.json'), '{"x":1}\n', 'utf8')
  return { dir, root }
}

test('布局迁移：日/月/年/梦 → 岁月涟漪/梦境；改写 path；旧目录清空；幂等', () => {
  const { dir, root } = setup()
  try {
    const report = migrateLayout(root, { apply: true })
    assert.equal(report.dry, false)
    assert.ok(fs.existsSync(path.join(root, '岁月涟漪', '日档', '2026', '10', '2026-10-18.md')))
    assert.ok(fs.existsSync(path.join(root, '岁月涟漪', '月响', '2026', '2026-10.md')))
    assert.ok(fs.existsSync(path.join(root, '岁月涟漪', '年轮', '2026.md')))
    assert.ok(fs.existsSync(path.join(root, '梦境', '2026', '10', '2026-10-18.md')))
    assert.equal(fs.existsSync(path.join(root, '日')), false)
    assert.equal(fs.existsSync(path.join(root, '梦')), false)
    assert.match(
      fs.readFileSync(path.join(root, '岁月涟漪', '日档', '2026', '10', '2026-10-18.md'), 'utf8'),
      /"path":"岁月涟漪\/日档\/2026\/10\/2026-10-18\.md"/,
    )
    assert.ok(fs.readdirSync(path.join(root, '元')).some((name) => name.startsWith('索引.jsonl.bak-layout-')))
    const second = migrateLayout(root, { apply: true })
    assert.equal(second.moves.length, 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
