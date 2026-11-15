import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { resolveConfig } from '../memory/config.js'
import { ensureTree, resolveRoot } from '../memory/store.js'
import { loadDreamState, saveDreamState } from '../memory/dream.js'
import { installDream } from '../host/dream.mjs'

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-dream-modern-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

function modernCtx() {
  const tasks = []
  const handlers = new Map()
  const schedule = {
    async list({ limit = 100 } = {}) {
      return { items: tasks.slice(0, limit), shown: tasks.length, total: tasks.length, limit, offset: 0 }
    },
    async create(request) {
      const task = {
        id: `task-${tasks.length + 1}`,
        title: request.title,
        kind: 'daily',
        time: request.timing.daily.time,
        timeZone: request.timing.daily.time_zone,
        target: request.target,
      }
      tasks.push(task)
      return task
    },
    async edit(request) {
      const index = tasks.findIndex((task) => task.id === request.id)
      if (request.action === 'delete') {
        if (index >= 0) tasks.splice(index, 1)
        return { id: request.id, deleted: true }
      }
      if (index >= 0 && request.patch?.timing?.daily !== undefined) {
        tasks[index].time = request.patch.timing.daily.time
        tasks[index].timeZone = request.patch.timing.daily.time_zone
      }
      return tasks[index] ?? { id: request.id, code: 'schedule_not_found' }
    },
  }
  const services = {
    agentPresets: { composedPreset: () => 'chat' },
    agents: { list: () => [{ id: 'sess-1', session: { id: 'sess-1', header: { createdAt: 1 } }, ctx: {} }] },
    schedule,
  }
  return {
    tasks,
    handlers,
    get: (name) => services[name],
    on(event, fn) {
      handlers.set(event, fn)
      return () => handlers.delete(event)
    },
    logger: { info() {}, warn() {} },
  }
}

test('DSH 0.2.2 schedule API：创建用 timing/target，关闭时用 edit 删除', async () => {
  const { dir, root } = setup()
  try {
    const ctx = modernCtx()
    const service = { root, config: resolveConfig({ dream: { enabled: true, time: '23:30:00' } }) }
    installDream(ctx, service)
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(ctx.tasks.length, 1)
    assert.equal(ctx.tasks[0].target.kind, 'session')
    assert.equal(ctx.tasks[0].target.sessionId, 'sess-1')
    assert.equal(ctx.tasks[0].time, '23:30:00')
    assert.equal(loadDreamState(root).schedules['sess-1'] !== undefined, true)

    await service.dream.setSessionEnabled('sess-1', false)
    assert.equal(ctx.tasks.length, 0)
    assert.equal(loadDreamState(root).schedules['sess-1'], undefined)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('启动时清理状态里的旧日程，即使它已不存在于 schedule 服务', async () => {
  const { dir, root } = setup()
  try {
    const state = loadDreamState(root)
    state.schedules['stale-session'] = { id: 'gone-task', createdAt: 1 }
    saveDreamState(root, state)
    const ctx = modernCtx()
    const service = { root, config: resolveConfig({ dream: { enabled: true, time: '23:30:00' } }) }
    installDream(ctx, service)
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(loadDreamState(root).schedules['stale-session'], undefined)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
