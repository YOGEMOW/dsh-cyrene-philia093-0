import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ensureTree } from '../memory/store.js'
import { listFreeArea, planFreeSync, renderFreeContent, inNoSync, isFreeTextFile } from '../memory/freearea.js'
import { freeHPath } from '../memory/siyuan.js'

function tmpRoot() {
  return join(mkdtempSync(join(tmpdir(), 'ope-free-')), 'cyrene-philia093-0')
}

test('余页镜像：列出文本文件，跳过 .nosync 与非文本', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    // ensureTree 首建会写 余页/关于这里.md（欢迎页）；本测试只关心自己造的文件
    rmSync(join(root, '余页', '关于这里.md'), { force: true })
    mkdirSync(join(root, '余页', '笔记'), { recursive: true })
    mkdirSync(join(root, '余页', '.nosync', '私密'), { recursive: true })
    writeFileSync(join(root, '余页', '笔记', '想法.md'), '# 想法\n内容', 'utf8')
    writeFileSync(join(root, '余页', '配置.json'), '{"a":1}', 'utf8')
    writeFileSync(join(root, '余页', '.nosync', '私密', '不镜像.md'), 'secret', 'utf8')
    writeFileSync(join(root, '余页', '图片.png'), Buffer.from([1, 2, 3]))
    const files = listFreeArea(root)
    const rels = files.map((f) => f.rel).sort()
    assert.deepEqual(rels, ['余页/笔记/想法.md', '余页/配置.json'])
    assert.equal(inNoSync('余页/.nosync/x.md'), true)
    assert.equal(inNoSync('余页/笔记/x.md'), false)
    assert.equal(isFreeTextFile('a.md'), true)
    assert.equal(isFreeTextFile('a.png'), false)
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('余页镜像：hash 未变跳过，内容变化 upsert，本地删除 → delete', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    rmSync(join(root, '余页', '关于这里.md'), { force: true })
    const file = join(root, '余页', '想法.md')
    writeFileSync(file, 'v1', 'utf8')
    const first = listFreeArea(root)
    const plan1 = planFreeSync(first, {})
    assert.equal(plan1.upserts.length, 1)
    assert.equal(plan1.deletes.length, 0)
    const h1 = first[0].hash
    const state = { '余页/想法.md': { hash: h1, docId: 'doc-1' } }
    const plan2 = planFreeSync(first, state)
    assert.equal(plan2.upserts.length, 0)
    writeFileSync(file, 'v2', 'utf8')
    const changed = planFreeSync(listFreeArea(root), state)
    assert.equal(changed.upserts.length, 1)
    rmSync(file)
    const gone = planFreeSync(listFreeArea(root), state)
    assert.deepEqual(gone.deletes, ['余页/想法.md'])
  } finally {
    rmSync(join(root, '..'), { recursive: true, force: true })
  }
})

test('余页镜像：md 原样，非 md 包代码块；hpath 去掉 md 扩展名', () => {
  assert.equal(renderFreeContent('余页/a.md', '# t\n'), '# t\n')
  assert.match(renderFreeContent('余页/a.json', '{"x":1}\n'), /^```json\n/)
  assert.equal(freeHPath({ rootHPath: '/一页永恒' }, '余页/笔记/想法.md'), '/一页永恒/余页/笔记/想法')
  assert.equal(freeHPath({ rootHPath: '/一页永恒' }, '余页/配置.json'), '/一页永恒/余页/配置.json')
})
