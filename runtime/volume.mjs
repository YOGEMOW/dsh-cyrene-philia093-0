/**
 * 新卷（体：人类基座 / 重开新卷）。
 *
 * 规则（docs/CONTRACT.md 第 7 节）：
 *   - 只有人能开新卷（命令/配置调用本模块；不暴露成 AI 工具）；
 *   - 开卷时把当前人格语料快照进 `元/卷/<id>/persona/`，并记录 persona_hash；
 *   - `元/卷.json` 记录 current 与历史卷，只增不改。
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readJSON, safeRelPath, writeJSON } from '../memory/store.js'

const PERSONA_FILES = [
  ['persona/chat.md', 'chat.md'],
  ['persona/work.md', 'work.md'],
  ['philosophy/wuyu.md', 'wuyu.md'],
]

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

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

/** 计算人格语料指纹。 */
export function personaHash() {
  const hash = createHash('sha256')
  for (const [rel] of PERSONA_FILES) {
    try {
      hash.update(fs.readFileSync(path.join(repoRoot, rel), 'utf8').replace(/\r\n?/g, '\n'))
    } catch {
      /* 缺文件不阻塞开卷，指纹只覆盖存在的部分 */
    }
  }
  return hash.digest('hex')
}

/**
 * 开新卷（只能由人调用）。
 * @param root 记忆根目录
 * @param {{ reason?: string, now?: number }} [options]
 */
export function openVolume(root, options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now()
  const state = readVolumeState(root)
  const id = (Number(state.current) || 0) + 1
  const hash = personaHash()
  const snapshotRel = `元/卷/${id}/persona`
  const snapshotAbs = safeRelPath(root, snapshotRel)
  if (snapshotAbs === null) return { ok: false, error: '卷目录路径非法' }
  try {
    fs.mkdirSync(snapshotAbs, { recursive: true })
    for (const [rel, name] of PERSONA_FILES) {
      try {
        const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8')
        fs.writeFileSync(path.join(snapshotAbs, name), text.replace(/\r\n?/g, '\n'), 'utf8')
      } catch {
        /* 缺文件跳过 */
      }
    }
    state.current = id
    state.volumes = [...(state.volumes ?? []), {
      id,
      started_at: now,
      reason: typeof options.reason === 'string' && options.reason.trim() !== '' ? options.reason.trim() : 'manual',
      persona_hash: hash,
      wuyu_version: '1',
    }]
    const file = safeRelPath(root, '元/卷.json')
    if (file === null) return { ok: false, error: '卷文件路径非法' }
    const ok = writeJSON(file, state)
    return { ok, id, hash, snapshot: snapshotRel, volumes: state.volumes.length }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
