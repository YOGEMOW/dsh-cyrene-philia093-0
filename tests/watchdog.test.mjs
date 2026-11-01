import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree } from '../memory/store.js'
import { runWatchdog } from '../memory/watchdog.js'

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-watchdog-'))
  const root = path.join(dir, 'cyrene-philia093-0')
  ensureTree(root)
  return { dir, root }
}

test('看门狗：发现旧目录残留；补当月/当年文件；检查计数', () => {
  const { dir, root } = setup()
  try {
    const now = new Date(2026, 10, 1, 12, 0, 0).getTime()
    // 造一个迁移前的旧目录
    fs.mkdirSync(path.join(root, '日', '2026', '10'), { recursive: true })
    fs.writeFileSync(path.join(root, '日', '2026', '10', '2026-10-18.md'), '# old\n', 'utf8')
    const before = runWatchdog(root, { now })
    assert.equal(before.ok, false)
    assert.ok(before.checks.some((check) => check.name === '旧路径 日 已清空' && check.ok === false))
    assert.ok(fs.existsSync(path.join(root, '岁月涟漪', '月响', '2026', '2026-11.md')))

    // 清掉旧目录后恢复
    fs.rmSync(path.join(root, '日'), { recursive: true, force: true })
    fs.mkdirSync(path.join(root, '岁月涟漪', '日档', '2026', '10'), { recursive: true })
    fs.writeFileSync(path.join(root, '岁月涟漪', '日档', '2026', '10', '2026-10-18.md'), '# day\n', 'utf8')
    fs.mkdirSync(path.join(root, '梦境', '2026', '10'), { recursive: true })
    fs.writeFileSync(path.join(root, '梦境', '2026', '10', '2026-10-18.md'), '# dream\n', 'utf8')
    const after = runWatchdog(root, { now })
    assert.equal(after.ok, true)
    assert.equal(after.counts.days, 1)
    assert.equal(after.counts.dreams, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
