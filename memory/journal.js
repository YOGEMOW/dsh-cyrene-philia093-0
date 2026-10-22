/**
 * 梦志补记：从日档条目生成「补记」，供夜梦兜底与手动补记复用。
 *
 * 用户明确要的是「补记」——当晚模型没写梦志时，按日档把当天留下的记忆补进去，
 * 而不是生成一份冷冰冰的"摘要"。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeDreamJournal } from './dream.js'
import { loadEntries } from './entries.js'

/** 某一天的补记正文；没有条目返回 null。 */
export function buildDayNote(root, day) {
  let entries = []
  try {
    entries = loadEntries(root).entries.filter((entry) => entry?.day === day)
  } catch {
    return null
  }
  if (entries.length === 0) return null
  const lines = entries.map((entry) => {
    const stamp = new Date(Number(entry.fact_time) || Number(entry.created_at) || Date.now())
    const hh = String(stamp.getHours()).padStart(2, '0')
    const mm = String(stamp.getMinutes()).padStart(2, '0')
    const text = String(entry.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)
    return `- ${hh}:${mm} · ${entry.axis ?? '美'}｜${text}`
  })
  return [
    '当晚整理没有留下梦志，按日档补上：',
    '',
    ...lines,
  ].join('\n')
}

/** 读梦志正文（没有返回 ''）。 */
export function readJournal(root, day) {
  const file = join(root, '梦', `${day}.md`)
  try {
    return existsSync(file) ? readFileSync(file, 'utf8') : ''
  } catch {
    return ''
  }
}

/**
 * 为最近 N 天补记。
 * @param {{ days?: number, now?: number, force?: boolean, dryRun?: boolean }} [options]
 * @returns {{ days: Array<{day:string, action:string}>, written:number }}
 */
export function repairJournals(root, options = {}) {
  const days = Math.max(1, Math.min(90, Number(options.days) || 7))
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now()
  const force = options.force === true
  const dryRun = options.dryRun === true
  const report = { days: [], written: 0 }
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(now - offset * 86400000)
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const note = buildDayNote(root, day)
    if (note === null) {
      report.days.push({ day, action: 'skip-no-entries' })
      continue
    }
    const existing = readJournal(root, day)
    const filled = existing.includes('按日档补上')
    const hasRealJournal = existing.trim().length >= 80 && existing.includes('##') && !filled
    if (!force && hasRealJournal) {
      report.days.push({ day, action: 'skip-has-journal' })
      continue
    }
    if (!force && filled) {
      report.days.push({ day, action: 'skip-has-note' })
      continue
    }
    if (!dryRun) writeDreamJournal(root, note, now - offset * 86400000)
    report.days.push({ day, action: dryRun ? 'would-write' : 'written' })
    if (!dryRun) report.written += 1
  }
  return report
}

