/**
 * 截面镜像测试：在 sealed 吞掉 section 之前拿到全文，以 context 回注。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  MIRROR_CONTEXT_NAME,
  buildMirrorBlock,
  installSectionMirror,
  resolveMirrorConfig,
} from '../runtime/section-mirror.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const persona = fs.readFileSync(path.join(here, '..', 'persona', 'chat.md'), 'utf8').trim()

function fakeCtx() {
  const handlers = new Map()
  return {
    handlers,
    on(event, fn) {
      handlers.set(event, fn)
      return () => handlers.delete(event)
    },
    logger: { warn() {} },
  }
}

const service = () => ({ diagnostics: { sections: null } })

const assemblyOf = (sections) => ({
  sections,
  contexts: [{ name: 'existing', text: '已有上下文' }],
  tools: [],
  variables: {},
})

const run = async (handler, assembly) => handler(assembly, { agent: { session: { id: 's1' } } }, async () => assembly)

test('默认 auto：镜像 tool:/plan:，跳过 persona/identity；context 追加在尾部且不插值', async () => {
  const ctx = fakeCtx()
  const svc = service()
  installSectionMirror(ctx, svc)
  const handler = ctx.handlers.get('system-prompt/assemble')
  assert.equal(typeof handler, 'function')

  const assembly = assemblyOf([
    { name: 'deployment:persona-prefix', text: persona },
    { name: 'tool:read', text: 'Use the read tool.' },
    { name: 'tool:bash', text: 'Check the exit code.' },
    { name: 'plan:policy', text: 'You are in plan mode.' },
    { name: 'identity:brand', text: 'You are an AI agent.' },
    { name: 'deployment:persona-suffix', text: '' },
    { name: 'tool:empty', text: '' },
  ])
  const out = await run(handler, assembly)
  assert.equal(out.contexts.length, 2)
  const mirror = out.contexts[1]
  assert.equal(mirror.name, MIRROR_CONTEXT_NAME)
  assert.equal(mirror.interpolate, false)
  assert.match(mirror.text, /tool:read/)
  assert.match(mirror.text, /tool:bash/)
  assert.match(mirror.text, /plan:policy/)
  assert.equal(mirror.text.includes('You are an AI agent'), false)
  assert.equal(mirror.text.includes('系统规则（Chat 模式专用）'), false)

  assert.deepEqual(svc.diagnostics.sections.mirrored.map((m) => m.name), ['tool:read', 'tool:bash', 'plan:policy'])
  const skippedNames = svc.diagnostics.sections.skipped.map((s) => s.name)
  assert.equal(skippedNames.includes('identity:brand'), true)
  assert.equal(skippedNames.includes('deployment:persona-prefix'), true)
})

test('mode=off：只观测不镜像；diagnostics 仍记录被吞掉的段', async () => {
  const ctx = fakeCtx()
  const svc = service()
  installSectionMirror(ctx, svc, { mode: 'off' })
  const out = await run(ctx.handlers.get('system-prompt/assemble'), assemblyOf([
    { name: 'tool:read', text: 'Use the read tool.' },
  ]))
  assert.equal(out.contexts.length, 1)
  assert.equal(svc.diagnostics.sections.mirrored.length, 0)
  assert.equal(svc.diagnostics.sections.skipped.some((s) => s.reason === 'mode-off'), true)
})

test('mode=allowlist：只镜像允许的名字', async () => {
  const ctx = fakeCtx()
  installSectionMirror(ctx, service(), { mode: 'allowlist', allow: ['tool:read'] })
  const out = await run(ctx.handlers.get('system-prompt/assemble'), assemblyOf([
    { name: 'tool:read', text: 'Read me.' },
    { name: 'tool:bash', text: 'Bash me.' },
  ]))
  const mirror = out.contexts[1]
  assert.match(mirror.text, /tool:read/)
  assert.equal(mirror.text.includes('Bash me.'), false)
})

test('预算与截断：超长正文被截断，总量不超 maxChars', () => {
  const config = resolveMirrorConfig({ maxChars: 500 })
  const built = buildMirrorBlock([
    { name: 'tool:big', text: 'x'.repeat(5000) },
  ], config, new Set())
  assert.equal(built.truncated, true)
  assert.equal(built.text.length <= 500 + 200, true)
  assert.equal(built.mirrored.length, 1)
})

test('按正文识别 persona：未知名字但内容等于人设 → 跳过', () => {
  const built = buildMirrorBlock([
    { name: 'custom:persona-copy', text: persona },
  ], resolveMirrorConfig({}), new Set([persona]))
  assert.equal(built.text, '')
  assert.equal(built.skipped[0].reason, 'persona-text')
})
