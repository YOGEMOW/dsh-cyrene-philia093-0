import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DREAM_MARKER,
  buildDreamPrompt,
  loadDreamState,
  saveDreamState,
  acquireDreamLease,
  releaseDreamLease,
  dreamedToday,
  lastDreamWindowStart,
  clearStaleLease,
  writeDreamJournal,
  markDayDreamed,
  dayOf
} from '../memory/dream.js'
import { ensureTree } from '../memory/store.js'

function tmpRoot() {
  return mkdtempSync(join(tmpdir(), 'ope-dream-'))
}

test('提示词：含六阶段、标记、硬规矩，且日期无关（每次现算）', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const prompt = buildDreamPrompt(root, { now: Date.now() })
    assert.match(prompt, /\[cyrene-dream\]/)
    assert.match(prompt, /收拢/)
    assert.match(prompt, /析忆/)
    assert.match(prompt, /联忆/)
    assert.match(prompt, /固忆/)
    assert.match(prompt, /忘忆/)
    assert.match(prompt, /记梦/)
    assert.match(prompt, /memory_write/)
    assert.match(prompt, /memory_dream_journal/)
    assert.match(prompt, /无源不入档/)
    assert.ok(prompt.length > 500)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('租赁：独占、过期可回收、成功释放记 lastDreamAt', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const state = loadDreamState(root)
    const now = Date.now()
    assert.equal(acquireDreamLease(state, 's1', now).ok, true)
    assert.equal(acquireDreamLease(state, 's2', now + 1000).ok, false)
    assert.equal(clearStaleLease(state, now + 60 * 60 * 1000), true)
    assert.equal(state.running, null)
    assert.equal(acquireDreamLease(state, 's2', now + 60 * 60 * 1000).ok, true)
    releaseDreamLease(state, 'done', now + 60 * 60 * 1000)
    assert.equal(state.lastDreamAt, now + 60 * 60 * 1000)
    assert.equal(dreamedToday(state, now + 60 * 60 * 1000), true)
    saveDreamState(root, state)
    assert.equal(loadDreamState(root).lastDreamAt, now + 60 * 60 * 1000)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('梦志落盘 + 日档 dreamed 标记', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = Date.now()
    const day = dayOf(now)
    const dayPath = join(root, '日', day.slice(0, 4), day.slice(5, 7), `${day}.md`)
    mkdirSync(join(root, '日', day.slice(0, 4), day.slice(5, 7)), { recursive: true })
    writeFileSync(dayPath, '---\ndate: ' + day + '\nentries: 0\n---\n\n# 日档\n', 'utf8')
    const w = writeDreamJournal(root, '今晚整理了三条记忆。', now)
    assert.equal(w.ok, true)
    assert.match(readFileSync(join(root, '梦', `${day}.md`), 'utf8'), /今晚整理了三条记忆/)
    assert.equal(markDayDreamed(root, now), true)
    assert.match(readFileSync(dayPath, 'utf8'), /dreamed: true/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('梦志落盘：正文自带标题会被去掉，但保留二级标题「日期 梦志」', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = Date.now()
    const day = dayOf(now)
    const w = writeDreamJournal(root, `# ${day} 梦志\n\n统计：新增 5 条。`, now)
    assert.equal(w.ok, true)
    const text = readFileSync(join(root, '梦', `${day}.md`), 'utf8')
    assert.equal((text.match(/^# /gm) ?? []).length, 1, '只应有一个一级标题')
    assert.ok(text.includes(`## ${day} 梦志`), '正文应有二级标题')
    assert.match(text, /统计：新增 5 条/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('夜梦窗口：23:30 之前凌晨的补梦不算今晚，23:30 之后才算', () => {
  const tz = 'Asia/Shanghai'
  const now = Date.UTC(2026, 9, 19, 15, 32, 13) // 2026-10-19 23:32 +08
  const start = lastDreamWindowStart(now, '23:30:00', tz)
  assert.equal(start, Date.UTC(2026, 9, 19, 15, 30, 0))
  // 当天 00:26 的补梦（10-19 00:26）早于今晚 23:30 窗口 → 应允许再跑
  assert.equal(dreamedToday({ lastDreamAt: Date.UTC(2026, 9, 18, 16, 26, 36) }, now, { time: '23:30:00', timeZone: tz }), false)
  // 今晚 23:30 之后跑过 → 跳过
  assert.equal(dreamedToday({ lastDreamAt: Date.UTC(2026, 9, 19, 15, 30, 5) }, now, { time: '23:30:00', timeZone: tz }), true)
})

test('同一天第二次梦志：追加「补记」而不是覆盖', () => {
  const root = tmpRoot()
  try {
    ensureTree(root)
    const now = Date.UTC(2026, 9, 19, 15, 30, 0)
    const first = writeDreamJournal(root, '第一次统计：新增 2 条。', now)
    assert.equal(first.ok, true)
    const second = writeDreamJournal(root, '第二次统计：新增 1 条。', now + 5 * 60_000)
    assert.equal(second.ok, true)
    const text = readFileSync(join(root, '梦', `${dayOf(now)}.md`), 'utf8')
    assert.match(text, /第一次统计：新增 2 条/)
    assert.match(text, /第二次统计：新增 1 条/)
    assert.match(text, /补记/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
