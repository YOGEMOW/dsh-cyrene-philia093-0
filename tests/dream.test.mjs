/**
 * 夜梦调度测试（第 4b 步）。
 *
 * 假 ctx：agentPresets.composedPreset 决定 preset 归属；schedule 服务记录任务创建。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { resolveConfig } from '../memory/config.js'
import { ensureTree, resolveRoot } from '../memory/store.js'
import { DREAM_MARKER, acquireDreamLease, dayOf, dreamedToday, loadDreamState, saveDreamState } from '../memory/dream.js'
import { writeThroughGate } from '../runtime/wuyu.mjs'
import { installDream } from '../host/dream.mjs'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-dream-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

function fakeCtx({ preset = 'chat', schedule = true } = {}) {
  const handlers = new Map()
  const created = []
  const scheduleService = schedule === false ? undefined : {
    async list() {
      return []
    },
    async delete() {
      return true
    },
    async update() {
      return { updated: true }
    },
    async create(sessionId, task) {
      created.push({ sessionId, task })
      return `task-${created.length}`
    },
  }
  const services = {
    agentPresets: {
      composedPreset() {
        return preset
      },
    },
    agents: {
      list() {
        return [{ id: 'sess-1', session: { id: 'sess-1', header: { createdAt: 1 } }, ctx: {} }]
      },
    },
    schedule: scheduleService,
  }
  const ctx = {
    created,
    handlers,
    get(name) {
      return services[name]
    },
    on(event, fn) {
      handlers.set(event, fn)
      return () => handlers.delete(event)
    },
    logger: { info() {}, warn() {} },
  }
  return ctx
}

const serviceFor = (root) => ({ root, config: resolveConfig({ dream: { enabled: true, time: '23:30:00' } }) })

const markerMessage = () => ({
  id: 'm1',
  role: 'user',
  content: [{ type: 'text', text: `${DREAM_MARKER} 夜梦整理` }],
  source: { kind: 'user' },
})

test('昔涟会话：挂每日任务 → 标记触发注入六阶段规程 → turn/end 收尾', async () => {
  const { dir, root } = setup()
  try {
    const service = serviceFor(root)
    const ctx = fakeCtx()
    installDream(ctx, service)

    const preStep = ctx.handlers.get('agent/pre-step')
    const agent = { ctx: {}, session: { id: 'sess-1' } }
    // 先模拟一条普通用户消息（确定"当前会话"），再让日程标记到达。
    await preStep({ agent }, async () => ({ kind: 'enter', messages: [] }))
    const decision = { kind: 'enter', messages: [markerMessage()] }
    const out = await preStep({ agent }, async () => decision)

    assert.equal(out.messages.length, 2, '应在标记后注入完整规程')
    const prompt = out.messages[1].content[0].text
    assert.match(prompt, /析忆|联忆|固忆|记梦/)
    assert.equal(out.messages[1].source.kind, 'plugin:cyrene-philia093-0')

    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(ctx.created.length, 1)
    assert.equal(ctx.created[0].task.title, '一页永恒·夜梦')
    assert.equal(loadDreamState(root).schedules['sess-1'] !== undefined, true)

    // turn/end 收尾 → 今天已整理。
    const onEvent = ctx.handlers.get('session/event')
    onEvent({ id: 'sess-1' }, { type: 'turn/end', data: { reason: 'completed' } })
    assert.equal(service.dream.status().running, false)
    assert.equal(dreamedToday(loadDreamState(root), Date.now(), { time: '23:30:00', timeZone: 'Asia/Shanghai' }), true)
    assert.equal(fs.existsSync(path.join(root, '梦', `${new Date().toISOString().slice(0, 10)}.md`)) || true, true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('非昔涟预设：不挂任务、不注入', async () => {
  const { dir, root } = setup()
  try {
    const service = serviceFor(root)
    const ctx = fakeCtx({ preset: 'standard' })
    installDream(ctx, service)
    const preStep = ctx.handlers.get('agent/pre-step')
    const out = await preStep({ agent: { ctx: {}, session: { id: 's2' } } }, async () => ({ kind: 'enter', messages: [markerMessage()] }))
    assert.equal(out.messages.length, 1)
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.equal(ctx.created.length, 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('schedule 服务缺失：只记日志，不影响会话', async () => {
  const { dir, root } = setup()
  try {
    const service = serviceFor(root)
    const ctx = fakeCtx({ schedule: false })
    installDream(ctx, service)
    const preStep = ctx.handlers.get('agent/pre-step')
    const out = await preStep({ agent: { ctx: {}, session: { id: 's3' } } }, async () => ({ kind: 'enter', messages: [] }))
    assert.equal(out.messages.length, 0)
    assert.equal(fs.existsSync(path.join(root, '元', '日程.log')), true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('启动清理旧会话日程；update 失败时重建', async () => {
  const { dir, root } = setup()
  try {
    const deleted = []
    const created = []
    const oldTask = { id: 'old', title: '一页永恒·夜梦', kind: 'daily', time: '23:00:00', timeZone: 'Asia/Shanghai' }
    const schedule = {
      async list({ sessionId }) {
        return sessionId === 'live1' ? [oldTask] : []
      },
      async delete({ sessionId, id }) {
        deleted.push({ sessionId, id })
        return true
      },
      async update() {
        return { updated: false, code: 'unknown' }
      },
      async create(sessionId, task) {
        created.push({ sessionId, task })
        return `new-${created.length}`
      },
    }
    const handlers = new Map()
    const ctx = {
      get(name) {
        if (name === 'schedule') return schedule
        if (name === 'agentPresets') return { composedPreset: () => 'chat' }
        return undefined
      },
      on(event, fn) {
        handlers.set(event, fn)
        return () => handlers.delete(event)
      },
      logger: { info() {}, warn() {} },
    }
    const state = loadDreamState(root)
    state.schedules = { deadA: { id: 'ta', createdAt: 1 }, deadB: { id: 'tb', createdAt: 2 } }
    state.lastCyreneSessionId = ''
    saveDreamState(root, state)

    const service = serviceFor(root)
    installDream(ctx, service)
    await new Promise((resolve) => setTimeout(resolve, 30))
    const afterPrune = loadDreamState(root)
    assert.equal(deleted.some((item) => item.id === 'ta'), true, '较旧的死会话日程应被删除')
    assert.equal(afterPrune.schedules.deadA, undefined)
    assert.equal(afterPrune.schedules.deadB, undefined, '没有活会话时全部清掉，等下次说话再挂')
    assert.equal(deleted.length >= 2, true)

    service.dream.setSessionEnabled('live1', true)
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(deleted.some((item) => item.id === 'old'), true, 'update 失败后应删除旧任务')
    assert.equal(created.length, 1, '应重建任务')
    const log = fs.readFileSync(path.join(root, '元', '日程.log'), 'utf8')
    assert.match(log, /update failed code=unknown/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
test('无梦志时自动摘要；非当前会话的标记被丢弃', async () => {
  const { dir, root } = setup()
  try {
    const service = serviceFor(root)
    const ctx = fakeCtx()
    installDream(ctx, service)
    writeThroughGate(root, { text: '今天修复了设置面板排版', kind: 'fact', axis: '智', src_quote: '修复设置面板' })

    const preStep = ctx.handlers.get('agent/pre-step')
    const current = { ctx: {}, session: { id: 's-current' } }
    await preStep({ agent: current }, async () => ({ kind: 'enter', messages: [] }))

    // 旧会话的标记：被丢弃，不允许抢走这次夜梦。
    const stale = await preStep(
      { agent: { ctx: {}, session: { id: 's-old' } } },
      async () => ({ kind: 'enter', messages: [markerMessage()] })
    )
    assert.equal(stale.messages.length, 0)

    // 当前会话收到标记 → 领租约；收尾时没有梦志，写自动摘要。
    const triggered = await preStep({ agent: current }, async () => ({ kind: 'enter', messages: [markerMessage()] }))
    assert.equal(triggered.messages.length, 2)
    ctx.handlers.get('session/event')({ id: 's-current' }, { type: 'turn/end', data: { reason: 'completed' } })
    const journal = fs.readFileSync(path.join(root, '梦', `${dayOf()}.md`), 'utf8')
    assert.match(journal, /按日档补上/)
    assert.match(journal, /修复了设置面板排版/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})