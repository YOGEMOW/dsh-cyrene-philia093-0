/**
 * 新卷扩展测试：五育字段、旧条目兼容、根目录解析永不落 CWD、链接编码。
 *
 * 运行：node tests/memory-philia.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  normalizeEntry,
  parseDay,
  renderDay,
  serializeEntry,
} from '../memory/parse.js'
import { resolveRoot } from '../memory/store.js'

const withEnv = (name, value, fn) => {
  const prev = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env[name]
    else process.env[name] = prev
  }
}

test('五育扩展：提供了才写入，缺省不出现（旧条目逐字兼容）', () => {
  const plain = normalizeEntry({ text: '旧条目', axis: '智', q: '你' }, { now: 1792000000000 })
  for (const key of ['consequence', 'entropy', 'legacy', 'aim', 'nature', 'base', 'vol', 'gate', 'promoted_at', 'source_ref']) {
    assert.equal(Object.hasOwn(plain, key), false, `旧条目不应凭空出现 ${key}`)
  }

  const full = normalizeEntry({
    text: '答应周末陪她走完旧街',
    kind: 'decision',
    axis: '德',
    q: '你',
    I: 7,
    S: 7,
    src: 'conv',
    src_ids: ['s-1/ev-2'],
    src_quote: '周六我不排事了，陪你走。',
    links: ['20261018140201-a1b2c3|因果'],
    consequence: { self: '少一次会', relation: '信任+', future: '同类选择会被参照' },
    entropy: { reduces: '把模糊的关系预期变清楚', resonances: ['20261018140201-a1b2c3'] },
    legacy: '后来者可以照着这个选择继续',
    aim: '把选择写进命运里',
    nature: { name: '认真', tier: 'high', serves_aim: true },
    base: true,
    vol: 0,
    gate: 'promoted',
    promoted_at: 1792016400000,
    source_ref: '余页/待定/2026-10-18.md',
  }, { now: 1792016400000 })

  assert.deepEqual(full.consequence, { self: '少一次会', relation: '信任+', future: '同类选择会被参照' })
  assert.deepEqual(full.entropy, { reduces: '把模糊的关系预期变清楚', resonances: ['20261018140201-a1b2c3'] })
  assert.equal(full.legacy.startsWith('后来者'), true)
  assert.equal(full.aim, '把选择写进命运里')
  assert.deepEqual(full.nature, { name: '认真', tier: 'high', serves_aim: true })
  assert.equal(full.base, true)
  assert.equal(full.vol, 0)
  assert.equal(full.gate, 'promoted')
  assert.equal(full.promoted_at, 1792016400000)
  assert.equal(full.source_ref, '余页/待定/2026-10-18.md')
  assert.deepEqual(full.links, ['20261018140201-a1b2c3|因果'])
})

test('五育扩展：序列化 → 解析 往返保留；缺省条目 JSON 里没有新键', () => {
  const entry = normalizeEntry({
    text: '养出「皮」是为了让对方放松',
    kind: 'decision',
    axis: '劳',
    q: '我',
    consequence: { other: '对方放松' },
    nature: { name: '皮', tier: 'low', serves_aim: true },
    gate: 'pending',
  }, { now: 1792000000000, day: '2026-10-18' })

  const md = renderDay({ date: '2026-10-18' }, [entry])
  const parsed = parseDay(md)
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.entries.length, 1)
  const back = parsed.entries[0]
  assert.deepEqual(back.consequence, { other: '对方放松' })
  assert.deepEqual(back.nature, { name: '皮', tier: 'low', serves_aim: true })
  assert.equal(back.gate, 'pending')

  const plain = normalizeEntry({ text: '纯事实', axis: '智' }, { now: 1792000000000, day: '2026-10-18' })
  const body = serializeEntry(plain)
  const json = JSON.parse(/<!--cyrene:(.*)-->/.exec(body)[1])
  for (const key of ['consequence', 'entropy', 'legacy', 'aim', 'nature', 'base', 'vol', 'gate']) {
    assert.equal(Object.hasOwn(json, key), false, `缺省条目的 JSON 不应含 ${key}`)
  }
})

test('根目录解析：DSH_HOME 优先；空白 DSH_HOME 回落 home；永不相对当前目录', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-root-'))
  try {
    withEnv('DSH_HOME', dir, () => {
      assert.equal(resolveRoot(), path.join(path.resolve(dir), 'cyrene-philia093-0'))
    })
    withEnv('DSH_HOME', '   ', () => {
      const fallback = resolveRoot()
      assert.equal(path.isAbsolute(fallback), true)
      assert.equal(fallback.endsWith(path.join('.dsh', 'cyrene-philia093-0')), true)
      assert.equal(fallback.startsWith(process.cwd() + path.sep), false, '不得落在 CWD')
    })
    withEnv('DSH_HOME', '', () => {
      const fallback = resolveRoot()
      assert.equal(path.isAbsolute(fallback), true)
      assert.equal(fallback.startsWith(process.cwd() + path.sep), false, '不得落在 CWD')
    })
    assert.equal(resolveRoot(path.join(dir, 'custom')), path.join(path.resolve(dir), 'custom'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('基线样例：一页永恒日档可解析，链接保持 id|type 编码', () => {
  const text = fs.readFileSync(new URL('./fixtures/baseline/eternal-day.sample.md', import.meta.url), 'utf8')
  const parsed = parseDay(text)
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.entries.length, 2)
  const decision = parsed.entries.find((e) => e.kind === 'decision')
  assert.ok(decision)
  assert.deepEqual(decision.links, ['20261018140201-a1b2c3|因果'])
  assert.equal(decision.consequence.relation, '信任+')
  assert.equal(decision.src_quote, '周六我不排事了，陪你走。')
})
