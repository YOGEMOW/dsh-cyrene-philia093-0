/**
 * 人格语料指纹 + 卷 0 补章。
 *
 * 设计（docs/CONTRACT.md 第 7 节）要求「开卷时记录 persona_hash」。
 * 迁移/首次装机时卷 0 是 import 建出来的，必须补上指纹，否则以后改人设没有历史可对比。
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readJSON, safeRelPath, writeJSON } from './store.js'

export const PERSONA_FILES = [
  ['persona/chat.md', 'chat.md'],
  ['persona/work.md', 'work.md'],
  ['philosophy/wuyu.md', 'wuyu.md'],
]

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

/** 计算人格语料指纹（缺失文件只覆盖存在部分）。 */
export function personaHash() {
  const hash = createHash('sha256')
  for (const [rel] of PERSONA_FILES) {
    try {
      hash.update(fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n?/g, '\n'))
    } catch {
      /* ignore */
    }
  }
  return hash.digest('hex')
}

/** 读卷状态（缺省卷 0）。 */
export function readVolumeState(root) {
  const file = safeRelPath(root, '元/卷.json')
  const fallback = {
    current: 0,
    volumes: [{ id: 0, started_at: 0, reason: 'initial', persona_hash: '', wuyu_version: '1' }],
  }
  if (file === null) return fallback
  const state = readJSON(file, null)
  if (state === null || typeof state !== 'object' || !Array.isArray(state.volumes)) return fallback
  return state
}

/**
 * 给当前卷补 persona_hash（空串时）。迁移建卷、旧数据复制都会走到这里。
 * @returns {{ ok:boolean, changed:boolean, hash:string, error?:string }}
 */
export function ensureVolumePersonaHash(root) {
  try {
    const state = readVolumeState(root)
    const current = (state.volumes ?? []).find((volume) => Number(volume?.id) === Number(state.current))
    if (current === undefined) return { ok: false, changed: false, hash: '', error: '当前卷不存在' }
    if (typeof current.persona_hash === 'string' && current.persona_hash !== '') {
      return { ok: true, changed: false, hash: current.persona_hash }
    }
    const hash = personaHash()
    current.persona_hash = hash
    const file = safeRelPath(root, '元/卷.json')
    if (file === null) return { ok: false, changed: false, hash, error: '卷文件路径非法' }
    const ok = writeJSON(file, state)
    return { ok, changed: ok, hash }
  } catch (error) {
    return { ok: false, changed: false, hash: '', error: error instanceof Error ? error.message : String(error) }
  }
}
