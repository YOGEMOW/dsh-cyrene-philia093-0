/**
 * 夜梦会话登记：默认开启、逐会话开关、活动记录、过期清理。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ensureTree, resolveRoot } from '../memory/store.js'
import {
  enabledSessionIds,
  isDreamEnabled,
  loadDreamSessions,
  pruneDreamSessions,
  setDreamEnabled,
  touchDreamSession,
} from '../memory/dream-sessions.js'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'philia-dream-sessions-'))
  const root = resolveRoot(path.join(dir, 'root'))
  ensureTree(root)
  return { dir, root }
}

test('默认开启；touch 后登记；可逐会话关闭', () => {
  const { dir, root } = setup()
  try {
    const empty = loadDreamSessions(root)
    assert.equal(empty.defaultEnabled, true)
    assert.equal(isDreamEnabled(empty, 's1'), true)

    touchDreamSession(root, 's1', { preset: 'chat', lastUserText: '  今天  有点累  ' })
    let state = loadDreamSessions(root)
    assert.equal(state.sessions.s1.lastUserText, '今天 有点累')
    assert.equal(state.sessions.s1.preset, 'chat')
    assert.equal(isDreamEnabled(state, 's1'), true)

    setDreamEnabled(root, 's1', false)
    state = loadDreamSessions(root)
    assert.equal(isDreamEnabled(state, 's1'), false)
    assert.deepEqual(enabledSessionIds(state), [])

    setDreamEnabled(root, 's1', true)
    setDreamEnabled(root, 's2', true)
    state = loadDreamSessions(root)
    assert.deepEqual(enabledSessionIds(state).sort(), ['s1', 's2'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('pruneDreamSessions：90 天没活动的登记会被清掉', () => {
  const { dir, root } = setup()
  try {
    setDreamEnabled(root, 'old', true)
    setDreamEnabled(root, 'fresh', true)
    const state = loadDreamSessions(root)
    state.sessions.old.lastActiveAt = Date.now() - 100 * 86400000
    state.sessions.fresh.lastActiveAt = Date.now() - 1000
    fs.writeFileSync(path.join(root, '元', '梦会话.json'), JSON.stringify(state), 'utf8')

    const pruned = pruneDreamSessions(root, ['fresh'])
    assert.equal(pruned.sessions.old, undefined)
    assert.notEqual(pruned.sessions.fresh, undefined)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
