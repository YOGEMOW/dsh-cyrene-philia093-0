/**
 * 运行期设置覆盖（设置面板写、宿主启动读）。
 *
 * Loader 行配置是"出厂/部署"层；这个文件是"人在面板里改"的层。
 * 读取顺序：默认值 ← 行配置 ← `元/settings.json`，所以面板不需要改 profile 文件。
 *
 * 只允许面板字段（siyuan/backup/dream 及少量预算）；写入前做浅层结构校验，
 * 具体范围与类型统一交给 `resolveConfig` 归一。
 */
import fs from 'node:fs'
import path from 'node:path'

import { readJSON, safeRelPath, writeJSON } from './store.js'

const ALLOWED = {
  siyuan: ['enabled', 'baseURL', 'notebook', 'rootHPath', 'tokenEnv', 'timeoutMs', 'createNotebook'],
  backup: ['enabled', 'intervalMinutes', 'snapshotHour', 'keep'],
  dream: ['enabled', 'time', 'timeZone', 'maxScheduledSessions'],
  root: ['hitTopK', 'recallBudget', 'quotaMB', 'freeQuotaMB'],
}

/** 读面板设置；坏文件回落空对象（fail-open）。 */
export function readSettings(root) {
  const file = safeRelPath(root, '元/settings.json')
  if (file === null) return {}
  const data = readJSON(file, null)
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return {}
  return data
}

/** 只保留白名单键；未提供的键不写入。 */
export function sanitizeSettings(patch) {
  const source = patch !== null && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
  const out = {}
  for (const section of ['siyuan', 'backup', 'dream']) {
    const value = source[section]
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    const picked = {}
    for (const key of ALLOWED[section]) {
      if (value[key] !== undefined && value[key] !== null) picked[key] = value[key]
    }
    if (Object.keys(picked).length > 0) out[section] = picked
  }
  for (const key of ALLOWED.root) {
    if (source[key] !== undefined && source[key] !== null) out[key] = source[key]
  }
  return out
}

/** 深合并普通对象（数组按整体替换）。 */
export function deepMerge(base, patch) {
  const a = base !== null && typeof base === 'object' && !Array.isArray(base) ? base : {}
  const b = patch !== null && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}
  const out = { ...a }
  for (const [key, value] of Object.entries(b)) {
    const current = a[key]
    if (value !== null && typeof value === 'object' && !Array.isArray(value)
      && current !== null && typeof current === 'object' && !Array.isArray(current)) {
      out[key] = deepMerge(current, value)
    } else {
      out[key] = value
    }
  }
  return out
}

/** 合并「行配置 ← 面板设置」。 */
export function mergeConfig(raw, settings) {
  return deepMerge(raw ?? {}, sanitizeSettings(settings))
}

/**
 * 写面板设置（与已有内容合并）。
 * @returns {{ ok:boolean, settings:object, error?:string }}
 */
export function writeSettings(root, patch) {
  try {
    const next = deepMerge(readSettings(root), sanitizeSettings(patch))
    const file = safeRelPath(root, '元/settings.json')
    if (file === null) return { ok: false, settings: {}, error: '设置文件路径非法' }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const ok = writeJSON(file, next)
    return { ok, settings: next, error: ok ? undefined : '写入失败' }
  } catch (error) {
    return { ok: false, settings: {}, error: error instanceof Error ? error.message : String(error) }
  }
}
