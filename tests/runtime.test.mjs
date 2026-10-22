/**
 * 第 3 步验收：runtime 轨道 + 宿主服务。
 *
 * 用假 ctx / 假服务在纯 Node 下验证：
 *   - 能力总则：order 150、含「不改变身份」声明、≤ 预算；
 *   - 计划桥：只在 planMode.get(agent).active 时出文本；
 *   - 记忆轨道：注册 {{cyrene_memory}}；首轮注入快照；同一块不重复；压缩后重注入；
 *   - 宿主：provide('cyreneMemory') 并建好根目录树。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { BUDGETS, ORDERS, PLUGIN_KIND } from '../runtime/rails.mjs'
import { CAPABILITY_TEXT, installCapability } from '../runtime/capability.mjs'
import { PLAN_BRIDGE_TEXT, installPlanBridge } from '../runtime/plan-bridge.mjs'
import { installMemoryRail } from '../runtime/memory-rail.mjs'
import { appendEntry, ensureTree, resolveRoot } from '../memory/store.js'
import { normalizeEntry } from '../memory/parse.js'
import { apply as hostApply } from '../host/index.mjs'

/** 假 systemPrompt：记录 variable/context 注册。 */
function fakeSystemPrompt() {
  const vars = new Map()
  const contexts = []
  return {
    vars,
    contexts,
    variable(name, provider) {
      vars.set(name, provider)
      return () => vars.delete(name)
    },
    context(spec) {
      contexts.push(spec)
      return () => {}
    },
  }
}

/** 假 ctx：只实现轨道用到的 on/inject/get/logger/provide。 */
function fakeCtx({ systemPrompt, planMode, provide } = {}) {
  const handlers = new Map()
  const services = { systemPrompt, planMode }
  const provided = []
  const ctx = {
    systemPrompt,
    planMode,
    handlers,
    provided,
    on(event, fn) {
      handlers.set(event, fn)
      return () => handlers.delete(event)
    },
    inject(names, callback) {
      if (!names.every((name) => services[name] !== undefined)) return
      const scope = { ...ctx }
      for (const name of names) scope[name] = services[name]
      callback(scope)
    },
    get(name) {
      return services[name]
    },
    provide(name, value) {
      provided.push({ name, value })
      services[name] = value
      if (typeof provide === 'function') provide(name, value)
      return () => {}
    },
    logger: { info() {}, warn() {} },
  }
  return ctx
}

const userMessage = (text) => ({
  id: `u-${Math.random().toString(16).slice(2, 8)}`,
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' },
})

const tempRoot = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-runtime-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

test('能力总则：order 150、预算内、声明「不改变身份」', () => {
  const systemPrompt = fakeSystemPrompt()
  installCapability({ systemPrompt })
  assert.equal(systemPrompt.contexts.length, 1)
  const spec = systemPrompt.contexts[0]
  assert.equal(spec.name, 'cyrene:capability')
  assert.equal(spec.order, ORDERS.capability)
  const text = spec.text({})
  assert.equal(text, CAPABILITY_TEXT)
  assert.match(text, /不改变你是谁/)
  assert.equal(text.length <= BUDGETS.capability, true)
})

test('计划桥：只在计划模式激活时出文本，且 order 155', () => {
  const systemPrompt = fakeSystemPrompt()
  const planMode = {
    get(agent) {
      return { active: agent?.session?.id === 'active' }
    },
  }
  installPlanBridge({ systemPrompt }, planMode)
  const spec = systemPrompt.contexts[0]
  assert.equal(spec.name, 'cyrene:plan-bridge')
  assert.equal(spec.order, ORDERS.planBridge)
  assert.equal(spec.text({ agent: { session: { id: 'active' } } }), PLAN_BRIDGE_TEXT)
  assert.equal(spec.text({ agent: { session: { id: 'idle' } } }), '')
  assert.equal(spec.text({}), '')
  assert.equal(PLAN_BRIDGE_TEXT.length <= BUDGETS.planBridge, true)
})

test('记忆轨道：注册指针变量；首轮快照；同块不重复；压缩后重注入', async () => {
  const { dir, root } = tempRoot()
  try {
    appendEntry(root, normalizeEntry({
      text: '用户喜欢先看结论，再看过程。',
      kind: 'fact',
      axis: '智',
      q: '你',
      kw: ['偏好', '结论'],
      src: 'conv',
      src_ids: ['s-1/ev-1'],
      day: '2026-10-22',
    }, { now: 1792000000000 }))

    const systemPrompt = fakeSystemPrompt()
    const ctx = fakeCtx({ systemPrompt })
    const disposer = installMemoryRail(ctx, { root, config: { injectEnabled: true, hitTopK: 2 } })
    assert.equal(typeof disposer, 'function')
    const pointer = systemPrompt.vars.get('cyrene_memory')
    assert.ok(pointer, '必须注册 {{cyrene_memory}}')
    assert.match(pointer(), /写作准则/)
    assert.match(pointer(), /无源不入档/)

    const preStep = ctx.handlers.get('agent/pre-step')
    assert.equal(typeof preStep, 'function')
    const payload = { agent: { session: { id: 'sess-1' } } }
    const decision = { kind: 'enter', messages: [userMessage('你好')] }
    const first = await preStep(payload, async () => decision)
    assert.equal(first.messages.length, 2, '首轮应注入一条快照')
    const injected = first.messages[0]
    assert.equal(injected.source.kind, PLUGIN_KIND)
    assert.equal(injected.role, 'user')
    assert.equal(typeof injected.id, 'string')
    assert.match(injected.content[0].text, /一页永恒/)

    const second = await preStep(payload, async () => ({ kind: 'enter', messages: [userMessage('你好')] }))
    assert.equal(second.messages.length, 1, '同一块不应重复注入')

    // 压缩结束 → 重置状态 → 下一条用户消息重注入快照。
    const onEvent = ctx.handlers.get('session/event')
    assert.equal(typeof onEvent, 'function')
    onEvent({ id: 'sess-1' }, { type: 'compaction/end', data: {} })
    const third = await preStep(payload, async () => ({ kind: 'enter', messages: [userMessage('还在吗')] }))
    assert.equal(third.messages.length, 2, '压缩后应重注入快照')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('记忆轨道：注入被禁用时不动 messages', async () => {
  const { dir, root } = tempRoot()
  try {
    const ctx = fakeCtx({ systemPrompt: fakeSystemPrompt() })
    installMemoryRail(ctx, { root, config: { injectEnabled: false, hitTopK: 2 } })
    const preStep = ctx.handlers.get('agent/pre-step')
    const decision = { kind: 'enter', messages: [userMessage('你好')] }
    const out = await preStep({ agent: { session: { id: 'sess-off' } } }, async () => decision)
    assert.equal(out.messages.length, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('宿主：提供 cyreneMemory 服务并在 DSH_HOME 下建树', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-home-'))
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const ctx = fakeCtx()
    hostApply(ctx, {})
    const record = ctx.provided.find((item) => item.name === 'cyreneMemory')
    assert.ok(record, '必须 provide cyreneMemory')
    assert.equal(record.value.root, path.join(path.resolve(home), 'cyrene-philia093-0'))
    assert.equal(fs.existsSync(path.join(record.value.root, '元')), true)
    assert.equal(fs.existsSync(path.join(record.value.root, '日')), true)
    assert.equal(record.value.config.injectPresets.includes('chat'), true)
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prev
    fs.rmSync(home, { recursive: true, force: true })
  }
})
