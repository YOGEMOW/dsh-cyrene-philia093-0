/**
 * 日 → 月 → 年 逐级整理（设计 §11，确定性部分）。
 *
 * 梦境的「析忆/固忆」负责 LLM 层的取舍；这里补上机器可保证的骨架：
 *  - 月档：上一个月有日档、且还没生成 月/YYYY-MM.md → 按五育主题汇总（不调 LLM）；
 *  - 年轮：跨年后补一份 年/YYYY.md 的「年轮定格」（月度索引 + 五育年检），
 *    已存在的年档（月度体检写入的）只追加，不覆盖。
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite, readTextSafe } from './store.js'

/** 本地日期前缀 YYYY-MM。 */
export function ymOf(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 上一个自然月。 */
export function prevMonth(now) {
  const d = new Date(now)
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return ymOf(d.getTime())
}

const AXES = ['德', '智', '体', '美', '劳']

/** 按五育分组，取各组重要度最高的若干条。 */
export function groupByAxis(entries, perAxis = 6) {
  const out = {}
  for (const axis of AXES) out[axis] = []
  for (const e of entries) {
    if (e === null || typeof e !== 'object' || typeof e.text !== 'string') continue
    const axis = AXES.includes(e.axis) ? e.axis : '美'
    out[axis].push(e)
  }
  for (const axis of AXES) {
    out[axis].sort((a, b) => (Number(b.I) || 0) - (Number(a.I) || 0))
    out[axis] = out[axis].slice(0, perAxis)
  }
  return out
}

/** 生成月档 Markdown。 */
export function buildMonthDoc(month, entries) {
  const rows = entries.filter((e) => typeof e?.day === 'string' && e.day.startsWith(month))
  const groups = groupByAxis(rows)
  const lines = [
    '---',
    `month: ${month}`,
    `entries: ${rows.length}`,
    `days: ${new Set(rows.map((e) => e.day)).size}`,
    '---',
    '',
    `# ${month} · 月档`,
    ''
  ]
  for (const axis of AXES) {
    const list = groups[axis]
    if (list.length === 0) continue
    lines.push(`## 主题：${axis}（${list.length} 条）`)
    for (const e of list) {
      const text = String(e.text).replace(/\s*\n\s*/g, ' ').slice(0, 120)
      lines.push(`- [I${e.I ?? 5}] ${text}（${String(e.day).slice(5)}）`)
    }
    lines.push('')
  }
  lines.push('## 统计')
  lines.push('| 维度 | 条数 |')
  lines.push('|---|---|')
  for (const axis of AXES) {
    lines.push(`| ${axis} | ${rows.filter((e) => e.axis === axis).length} |`)
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * 月档滚动：上个月有数据且月档不存在才写。
 * @returns { created, path, month, entries }
 */
export function rollMonthly(root, entries, now = Date.now()) {
  const month = prevMonth(now)
  const rows = (entries ?? []).filter((e) => typeof e?.day === 'string' && e.day.startsWith(month))
  const path = join(root, '月', `${month.slice(0, 4)}`, `${month}.md`)
  if (rows.length === 0) return { created: false, month, entries: 0, reason: 'empty' }
  if (existsSync(path) === true) return { created: false, month, entries: rows.length, reason: 'exists' }
  const ok = atomicWrite(path, buildMonthDoc(month, rows))
  return { created: ok === true, month, entries: rows.length, path }
}

/** 生成年轮定格段（追加到年档）。 */
export function buildYearSection(year, monthDocs, entries) {
  const rows = (entries ?? []).filter((e) => typeof e?.day === 'string' && e.day.startsWith(`${year}-`))
  const months = Object.entries(monthDocs).sort(([a], [b]) => a.localeCompare(b))
  const axes = {}
  for (const axis of AXES) axes[axis] = rows.filter((e) => e.axis === axis).length
  const links = rows.reduce((s, e) => s + (Array.isArray(e.links) ? e.links.length : 0), 0)
  const lines = [
    '',
    `## 年轮定格 ${year}`,
    '',
    '### 月度索引',
    ''
  ]
  if (months.length === 0) lines.push('- （无月档）')
  for (const [month, doc] of months) {
    const count = (doc.match(/^- \[I/gm) ?? []).length
    lines.push(`- ${month}：月档 ${count} 条主题摘要`)
  }
  lines.push('', '### 五育年检', '', '| 维度 | 条数 |', '|---|---|')
  for (const axis of AXES) lines.push(`| ${axis} | ${axes[axis]} |`)
  lines.push('', `联结密度：${rows.length === 0 ? 0 : (links / rows.length).toFixed(2)}｜条目 ${rows.length}`)
  lines.push('', '### 承卷', '', '- 这一年带我的是哪个模型/哪次换代：由外部记录补充。', '')
  return lines.join('\n')
}

/** 收集上一年度的月档内容。 */
export function readYearMonths(root, year) {
  const out = {}
  const dir = join(root, '月', year)
  let names = []
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    if (!/^\d{4}-\d{2}\.md$/.test(name)) continue
    out[name.replace(/\.md$/, '')] = readTextSafe(join(dir, name))
  }
  return out
}

/**
 * 年轮滚动：跨年后（1 月首次维护）给上一年度追加一次「年轮定格」。
 * 幂等：年档里已有 `## 年轮定格 YYYY` 就跳过。
 */
export function rollYearly(root, entries, now = Date.now()) {
  const d = new Date(now)
  if (d.getMonth() !== 0) return { created: false, reason: 'not-january' }
  const year = String(d.getFullYear() - 1)
  const rows = (entries ?? []).filter((e) => typeof e?.day === 'string' && e.day.startsWith(`${year}-`))
  if (rows.length === 0) return { created: false, reason: 'empty', year }
  const file = join(root, '年', `${year}.md`)
  const existing = existsSync(file) ? readTextSafe(file) : ''
  if (existing.includes(`## 年轮定格 ${year}`)) return { created: false, reason: 'exists', year }
  const doc = buildYearSection(year, readYearMonths(root, year), rows)
  const next = existing.trim() === ''
    ? `---\nyear: ${year}\n---\n\n# ${year} · 年轮\n${doc}`
    : `${existing.replace(/\s*$/, '')}\n${doc}`
  const ok = atomicWrite(file, next)
  return { created: ok === true, year, path: file }
}

/** 维护 tick 调用：先月后年。 */
export function rollCalendars(root, entries, now = Date.now()) {
  const monthly = rollMonthly(root, entries, now)
  const yearly = rollYearly(root, entries, now)
  return { monthly, yearly }
}
