/**
 * 四条上下文轨道 + runtime 模式矩阵测试。
 *
 * 假 ctx 只实现轨道用到的 on/inject/get/provide 与 systemPrompt/tools/commands。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree, resolveRoot } from '../memory/store.js'
import { apply as runtimeApply } from '../runtime/index.mjs'
import { installNickname, loadNickname } from '../runtime/nickname.mjs'
import { apply as applyScene, FORMS } from '../runtime/scene.mjs'
import { apply as applyStyle } from '../runtime/style.mjs'
import { apply as applyWorldbook } from '../runtime/worldbook/index.mjs'
import { ORDERS } from '../runtime/rails.mjs'

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

function fakeCtx({ systemPrompt, root, extra = {} } = {}) {
  const handlers = new Map()
  const tools = new Map()
  const commands = []
  const provided = []
  const services = {
    systemPrompt,
    cyreneMemory: root === undefined ? undefined : { root, config: { injectEnabled: true, hitTopK: 2 } },
    tools: {
      register(tool) {
        tools.set(tool.name, tool)
        return () => tools.delete(tool.name)
      },
    },
    commands: {
      register(definition) {
        commands.push(definition)
        return () => {}
      },
    },
    ...extra,
  }
  const ctx = {
    services,
    handlers,
    tools,
    commands,
    provided,
    systemPrompt,
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
    effect(fn) {
      if (typeof fn === 'function') fn()
      return () => {}
    },
    get(name) {
      return services[name]
    },
    provide(name, value) {
      provided.push({ name, value })
      services[name] = value
      return () => {}
    },
    logger: { info() {}, warn() {} },
  }
  return ctx
}

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-rails-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

const userMessage = (text) => ({ id: 'u1', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })

test('称呼轨道：user_nickname + context 120 + set_nickname；显式改口落盘', async () => {
  const { dir, root } = setup()
  try {
    const systemPrompt = fakeSystemPrompt()
    const ctx = fakeCtx({ systemPrompt, root })
    installNickname(ctx, ctx.services.cyreneMemory)
    assert.equal(systemPrompt.vars.get('user_nickname')(), '伙伴')
    const context = systemPrompt.contexts.find((spec) => spec.name === 'cyrene:nickname')
    assert.equal(context.order, ORDERS.nickname)
    assert.match(context.text({}), /称呼/)
    assert.ok(ctx.tools.get('set_nickname'))
    assert.match(ctx.tools.get('set_nickname').execute({ name: '老师' }), /称呼已改为「老师」/)
    assert.equal(loadNickname(root), '老师')

    const preStep = ctx.handlers.get('agent/pre-step')
    await preStep({ messages: [userMessage('以后叫我小明')] }, async () => ({ kind: 'enter', messages: [] }))
    assert.equal(loadNickname(root), '小明')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('形态/场景轨道：context 125 + set_form', () => {
  const { dir, root } = setup()
  try {
    const systemPrompt = fakeSystemPrompt()
    const ctx = fakeCtx({ systemPrompt, root })
    applyScene(ctx, {})
    const context = systemPrompt.contexts.find((spec) => spec.name === 'cyrene:form')
    assert.equal(context.order, ORDERS.form)
    assert.ok(ctx.tools.get('set_form'))
    const tool = ctx.tools.get('set_form')
    tool.execute({ form: 'mimi' }, { agent: { session: { id: 's1' } } })
    assert.match(context.text({ agent: { session: { id: 's1' } } }), new RegExp(FORMS.mimi.label))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('风格轨道：context 130 + /style 命令；状态写 元/style.json', () => {
  const { dir, root } = setup()
  try {
    const systemPrompt = fakeSystemPrompt()
    const ctx = fakeCtx({ systemPrompt, root })
    applyStyle(ctx, { storePath: path.join(root, '元', 'style.json'), customPath: path.join(root, '元', 'style-custom.md') })
    const context = systemPrompt.contexts.find((spec) => spec.name === 'cyrene:style')
    assert.equal(context.order, ORDERS.style)
    assert.match(context.text({ agent: { session: { id: 's1' } } }), /风格|说话|表达/)
    assert.equal(ctx.commands.some((c) => c.name === 'style'), true)
    assert.equal(ctx.handlers.has('agent/request'), true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('世界书轨道：context 140；元/worldbook.json 可关闭', () => {
  const { dir, root } = setup()
  try {
    const systemPrompt = fakeSystemPrompt()
    const ctx = fakeCtx({ systemPrompt, root })
    applyWorldbook(ctx, { root })
    const context = systemPrompt.contexts.find((spec) => spec.name === 'cyrene:worldbook-static')
    assert.equal(context.order, ORDERS.worldbook)
    assert.equal(context.text({}).length > 0, true)

    // 写配置关闭后（2 秒缓存）重新安装生效。
    fs.writeFileSync(path.join(root, '元', 'worldbook.json'), JSON.stringify({ enabled: false }), 'utf8')
    const systemPrompt2 = fakeSystemPrompt()
    const ctx2 = fakeCtx({ systemPrompt: systemPrompt2, root })
    applyWorldbook(ctx2, { root })
    const context2 = systemPrompt2.contexts.find((spec) => spec.name === 'cyrene:worldbook-static')
    assert.equal(context2.text({}), '')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime 模式矩阵：聊天全开（120/125/130/140/150），工作只留世界书与能力总则', () => {
  const { dir, root } = setup()
  try {
    const chat = fakeCtx({ systemPrompt: fakeSystemPrompt(), root })
    runtimeApply(chat, { rails: { nickname: true, style: true, scene: true, worldbook: true } })
    const chatOrders = chat.systemPrompt.contexts.map((spec) => spec.order).sort((a, b) => a - b)
    for (const order of [ORDERS.nickname, ORDERS.form, ORDERS.style, ORDERS.worldbook, ORDERS.capability]) {
      assert.equal(chatOrders.includes(order), true, `聊天模式缺少 order ${order}`)
    }
    for (const name of ['memory_write', 'remember', 'set_nickname', 'set_form']) {
      assert.ok(chat.tools.get(name), `聊天模式缺少工具 ${name}`)
    }

    const work = fakeCtx({ systemPrompt: fakeSystemPrompt(), root })
    runtimeApply(work, { rails: { nickname: false, style: false, scene: false, worldbook: true } })
    const workOrders = work.systemPrompt.contexts.map((spec) => spec.order)
    assert.equal(workOrders.includes(ORDERS.nickname), false)
    assert.equal(workOrders.includes(ORDERS.form), false)
    assert.equal(workOrders.includes(ORDERS.style), false)
    assert.equal(workOrders.includes(ORDERS.worldbook), true)
    assert.equal(workOrders.includes(ORDERS.capability), true)
    assert.equal(work.tools.get('set_nickname'), undefined)
    assert.equal(work.tools.get('set_form'), undefined)
    assert.ok(work.tools.get('memory_write'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
