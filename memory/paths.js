/**
 * 记忆路径单一真源（0.4.0 起）。
 *
 * 逻辑层级：
 *   岁月涟漪/日档/YYYY/MM/YYYY-MM-DD.md
 *   岁月涟漪/月响/YYYY/YYYY-MM.md
 *   岁月涟漪/年轮/YYYY.md
 *   梦境/YYYY/MM/YYYY-MM-DD.md
 *
 * 旧版路径（0.3.x）：
 *   日/YYYY/MM/YYYY-MM-DD.md、月/YYYY/YYYY-MM.md、年/YYYY.md、梦/YYYY-MM-DD.md
 * 读取时保留旧路径兼容；写入一律新路径。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const ROOT_DIR = '岁月涟漪'
export const DAY_ROOT = '岁月涟漪/日档'
export const MONTH_ROOT = '岁月涟漪/月响'
export const YEAR_ROOT = '岁月涟漪/年轮'
export const DREAM_ROOT = '梦境'
export const ANCHOR_HISTORY_ROOT = '锚/历史'

export const LEGACY_DAY_ROOT = '日'
export const LEGACY_MONTH_ROOT = '月'
export const LEGACY_YEAR_ROOT = '年'
export const LEGACY_DREAM_ROOT = '梦'

/** 顶层目录（ensureTree 用）。 */
export const TOP_DIRS = ['锚', ANCHOR_HISTORY_ROOT, ROOT_DIR, DAY_ROOT, MONTH_ROOT, YEAR_ROOT, DREAM_ROOT, '档', '余页', '元']

/** 日档相对路径（新）。 */
export function dayRelPath(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''))
  if (m === null) return ''
  const [, y, mm, dd] = m
  return `${DAY_ROOT}/${y}/${mm}/${y}-${mm}-${dd}.md`
}

/** 旧日档相对路径（兼容读取/迁移）。 */
export function legacyDayRelPath(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''))
  if (m === null) return ''
  const [, y, mm, dd] = m
  return `${LEGACY_DAY_ROOT}/${y}/${mm}/${y}-${mm}-${dd}.md`
}

/** 月响相对路径（新）。 */
export function monthRelPath(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month ?? ''))
  if (m === null) return ''
  return `${MONTH_ROOT}/${m[1]}/${month}.md`
}

/** 旧月档相对路径。 */
export function legacyMonthRelPath(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month ?? ''))
  if (m === null) return ''
  return `${LEGACY_MONTH_ROOT}/${m[1]}/${month}.md`
}

/** 年轮相对路径（新）。 */
export function yearRelPath(year) {
  return /^\d{4}$/.test(String(year ?? '')) ? `${YEAR_ROOT}/${year}.md` : ''
}

/** 旧年档相对路径。 */
export function legacyYearRelPath(year) {
  return /^\d{4}$/.test(String(year ?? '')) ? `${LEGACY_YEAR_ROOT}/${year}.md` : ''
}

/** 梦境（夜梦）相对路径（新）。 */
export function dreamRelPath(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''))
  if (m === null) return ''
  const [, y, mm, dd] = m
  return `${DREAM_ROOT}/${y}/${mm}/${y}-${mm}-${dd}.md`
}

/** 旧梦志相对路径。 */
export function legacyDreamRelPath(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''))
  if (m === null) return ''
  return `${LEGACY_DREAM_ROOT}/${y}-${mm}-${dd}.md`
}

/** 绝对路径。 */
export function absPath(root, rel) {
  return join(root, ...String(rel).split('/'))
}

/** 读取时优先新路径，不存在再回落旧路径。 */
export function existingPath(root, rel, legacyRel = '') {
  const primary = absPath(root, rel)
  if (existsSync(primary)) return primary
  if (legacyRel !== '') {
    const legacy = absPath(root, legacyRel)
    if (existsSync(legacy)) return legacy
  }
  return primary
}

/** 是否为旧版目录（迁移脚本用）。 */
export function isLegacyRoot(name) {
  return [LEGACY_DAY_ROOT, LEGACY_MONTH_ROOT, LEGACY_YEAR_ROOT, LEGACY_DREAM_ROOT].includes(name)
}
