/**
 * 命令测试：/cyrene doctor、/memory、/dream。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree, resolveRoot } from '../memory/store.js'
import { resolveConfig } from '../memory/config.js'
import { writeThroughGate } from '../runtime/wuyu.mjs'
import { installCommands } from '../runtime/commands.mjs'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-cmd-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

function fakeCtx() {
  const defs = []
  const commands = {
    register(definition) {
      defs.push(definition)
      return () => {}
    },
  }
  const ctx = {
    defs,
    get() {
      return undefined
    },
    inject(names, callback) {
      if (names.includes('commands')) {
        const scope = { ...ctx, commands, effect: (fn) => (typeof fn === 'function' ? fn() : () => {}) }
        callback(scope)
      }
    },
  }
  return ctx
}

const serviceFor = (root, extra = {}) => ({
  root,
  config: resolveConfig({}),
  diagnostics: {
    drift: { ok: true, presets: [] },
    sections: { at: 1, mode: 'auto', seen: 6, mirrored: [{ name: 'tool:read', chars: 40 }], skipped: [], truncated: false, totalChars: 120 },
  },
  ...extra,
})

test('注册三个命令；doctor 输出根目录/档位/待定/漂移', () => {
  const { dir, root } = setup()
  try {
    writeThroughGate(root, { text: '用户喜欢先看结论', kind: 'fact', axis: '智', src_quote: '先说结论' })
    writeThroughGate(root, { text: '没来源的事', kind: 'fact', axis: '智' })
    const ctx = fakeCtx()
    const service = serviceFor(root, {
      dream: { triggerDream: async () => ({ ok: true, message: '已启动整理。' }) },
      maintenance: { status: () => ({ siyuan: { enabled: false }, lastMirrorError: '' }) },
    })
    installCommands(ctx, service, '0.1.0')
    assert.deepEqual(ctx.defs.map((d) => d.name), ['cyrene', 'memory', 'dream'])

    const doctor = ctx.defs[0].handler({ rawInput: 'doctor', agent: { session: { header: {} } } })
    assert.equal(doctor.kind, 'success')
    assert.match(doctor.text, /cyrene doctor/)
    assert.match(doctor.text, /sealed/)
    assert.match(doctor.text, /待定 1 条/)
    assert.match(doctor.text, /无漂移/)
    assert.match(doctor.text, /截面：镜像 1 段/)
    assert.match(doctor.text, new RegExp(root.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')))

    assert.equal(ctx.defs[0].handler({ rawInput: 'nope' }).kind, 'error')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('/memory 输出锚点与统计；/dream 转发到 service.dream', async () => {
  const { dir, root } = setup()
  try {
    writeThroughGate(root, { text: '用户对猫毛过敏', kind: 'fact', axis: '体', src_quote: '我对猫毛过敏' })
    const ctx = fakeCtx()
    const calls = []
    const service = serviceFor(root, {
      dream: {
        triggerDream: async (agent) => {
          calls.push(agent)
          return { ok: true, message: '已启动整理。' }
        },
      },
    })
    installCommands(ctx, service, '0.1.0')
    const memory = ctx.defs[1].handler({})
    assert.equal(memory.kind, 'success')
    assert.match(memory.text, /记忆概览/)
    assert.match(memory.text, /待定 0/)

    const dream = await ctx.defs[2].handler({ agent: { id: 'a1' } })
    assert.equal(dream.kind, 'success')
    assert.equal(calls.length, 1)

    // 夜梦未安装时 /dream 报错。
    const ctx2 = fakeCtx()
    installCommands(ctx2, serviceFor(root), '0.1.0')
    const noDream = await ctx2.defs[2].handler({})
    assert.equal(noDream.kind, 'error')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
