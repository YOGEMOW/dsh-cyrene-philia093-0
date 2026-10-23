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
import { readVolumeState } from '../runtime/volume.mjs'
import { installCommands, apply as applyCommands } from '../runtime/commands.mjs'

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

test('注册三个命令；doctor 输出根目录/档位/待定/漂移', async () => {
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

    const doctor = await ctx.defs[0].handler({ rawInput: 'doctor', agent: { session: { header: {} } } })
    assert.equal(doctor.kind, 'success')
    assert.match(doctor.text, /cyrene doctor/)
    assert.match(doctor.text, /sealed/)
    assert.match(doctor.text, /待定 1 条/)
    assert.match(doctor.text, /无漂移/)
    assert.match(doctor.text, /截面：镜像 1 段/)
    assert.match(doctor.text, new RegExp(root.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')))

    assert.equal((await ctx.defs[0].handler({ rawInput: 'nope' })).kind, 'error')
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

test('/cyrene sync 与 /cyrene backup 走 maintenance', async () => {
  const { dir, root } = setup()
  try {
    const ctx = fakeCtx()
    const service = serviceFor(root, {
      maintenance: {
        syncNow: async () => ({ ok: true, entries: 3 }),
        backupNow: () => ({ ok: true, path: 'C:/snap/1' }),
      },
    })
    installCommands(ctx, service, '0.1.0')
    const sync = await ctx.defs[0].handler({ rawInput: 'sync' })
    assert.equal(sync.kind, 'success')
    assert.match(sync.text, /已同步到思源/)
    const backup = await ctx.defs[0].handler({ rawInput: 'backup' })
    assert.equal(backup.kind, 'success')
    assert.match(backup.text, /已备份/)
    assert.equal((await ctx.defs[0].handler({ rawInput: 'nope' })).kind, 'error')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('行插件 apply：直接注册到 ctx.commands，并写命令诊断日志', async () => {
  const { dir, root } = setup()
  try {
    const defs = []
    const ctx = {
      commands: {
        register(definition) {
          defs.push(definition)
          return () => {}
        },
      },
      cyreneMemory: serviceFor(root),
      logger: { warn() {} },
      get() {
        return undefined
      },
    }
    applyCommands(ctx)
    assert.deepEqual(defs.map((def) => def.name), ['cyrene', 'memory', 'dream'])
    const doctor = await defs[0].handler({ rawInput: 'doctor', agent: { session: { header: {} } } })
    assert.equal(doctor.kind, 'success')
    assert.match(doctor.text, /cyrene doctor/)
    const diag = path.join(root, '元', '命令诊断.log')
    assert.equal(fs.existsSync(diag), true)
    const log = fs.readFileSync(diag, 'utf8')
    assert.match(log, /registered cyrene/)
    assert.match(log, /registered dream/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('/cyrene new-volume 需要 confirm 才开卷', async () => {
  const { dir, root } = setup()
  try {
    const ctx = fakeCtx()
    installCommands(ctx, serviceFor(root), '0.1.0')
    const refused = await ctx.defs[0].handler({ rawInput: 'new-volume' })
    assert.equal(refused.kind, 'error')
    assert.match(refused.text, /confirm/)
    assert.equal(readVolumeState(root).current, 0)

    const opened = await ctx.defs[0].handler({ rawInput: 'new-volume confirm 测试开卷' })
    assert.equal(opened.kind, 'success')
    assert.match(opened.text, /已开卷 #1/)
    assert.equal(readVolumeState(root).current, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
