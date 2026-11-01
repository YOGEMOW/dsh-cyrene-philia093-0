/**
 * 归档看门狗（本地检查 + 自动修补）。
 *
 * 借鉴 Super-agent 的 Watchdog：不靠主循环自己发现问题，而是在外部定时巡检
 * 「文件是否在、目录是否对、旧路径是否残留、当天/当月骨架是否缺」。
 * 只做本地、幂等、fail-open；思源连通性检查由维护 tick 另行记录。
 */
import fs from 'node:fs'
import path from 'node:path'

import { DAY_ROOT, DREAM_ROOT, MONTH_ROOT, YEAR_ROOT, absPath } from './paths.js'
import { ensureCalendarDocs, ymOf } from './rolling.js'
import { readTextSafe } from './store.js'

function countFiles(dir) {
  let count = 0
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) count += countFiles(abs)
      else if (entry.isFile() && entry.name.endsWith('.md')) count += 1
    }
  } catch {
    /* 缺目录算 0 */
  }
  return count
}

function hasFiles(dir) {
  try {
    return fs.readdirSync(dir).length > 0
  } catch {
    return false
  }
}

/**
 * @param {string} root
 * @param {{ensure?: boolean, now?: number}} options
 */
export function runWatchdog(root, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const checks = []
  const repaired = []
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok: ok === true, detail })
    return ok === true
  }

  for (const rel of [DAY_ROOT, MONTH_ROOT, YEAR_ROOT, DREAM_ROOT]) {
    const dir = absPath(root, rel)
    let ok = fs.existsSync(dir)
    if (!ok && options.ensure !== false) {
      try {
        fs.mkdirSync(dir, { recursive: true })
        repaired.push(`创建目录 ${rel}`)
        ok = true
      } catch {
        /* 失败保持 false */
      }
    }
    check(`目录 ${rel}`, ok)
  }

  // 旧布局残留（0.4.0 迁移后不应再有日/月/年/梦）
  for (const rel of ['日', '月', '年', '梦']) {
    const dir = absPath(root, rel)
    check(`旧路径 ${rel} 已清空`, !fs.existsSync(dir) || !hasFiles(dir))
  }

  if (options.ensure !== false) {
    try {
      const ensured = ensureCalendarDocs(root, now)
      if (ensured.createdMonth === true) repaired.push(`补月响骨架 ${ensured.month}`)
      if (ensured.createdYear === true) repaired.push(`补年轮骨架 ${ensured.year}`)
    } catch {
      /* ignore */
    }
  }
  const monthFile = absPath(root, `${MONTH_ROOT}/${new Date(now).getFullYear()}/${ymOf(now)}.md`)
  check('当月月响文件', fs.existsSync(monthFile), monthFile)
  const yearFile = absPath(root, `${YEAR_ROOT}/${new Date(now).getFullYear()}.md`)
  check('当年年轮文件', fs.existsSync(yearFile), yearFile)

  const counts = {
    days: countFiles(absPath(root, DAY_ROOT)),
    months: countFiles(absPath(root, MONTH_ROOT)),
    years: countFiles(absPath(root, YEAR_ROOT)),
    dreams: countFiles(absPath(root, DREAM_ROOT)),
  }
  check('日档有内容', counts.days > 0, `days=${counts.days}`)
  check('梦境有内容', counts.dreams > 0, `dreams=${counts.dreams}`)
  if (counts.months > 0) {
    const sample = absPath(root, MONTH_ROOT)
    try {
      const yearDirs = fs.readdirSync(sample)
      const firstYear = yearDirs[0]
      if (firstYear !== undefined) {
        const names = fs.readdirSync(path.join(sample, firstYear))
        const first = names.find((n) => n.endsWith('.md'))
        if (first !== undefined) {
          const text = readTextSafe(path.join(sample, firstYear, first))
          check('月响正文可读', text.trim().length > 0, first)
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { ok: checks.every((item) => item.ok === true), checks, repaired, counts, at: now }
}
