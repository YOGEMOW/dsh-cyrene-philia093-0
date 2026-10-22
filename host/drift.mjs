/**
 * 能力快照漂移检测（第 5 步）。
 *
 * 生成预设时，内置能力行来自 `modes/base/<base>.plugins.json` 快照（dshVersion 记录在快照里）。
 * 运行中的 DSH 可能已经升级：本模块在宿主启动后读取**当前运行的内置预设**，与快照对比行 id 集合，
 * 少行/多行都会报出来（不阻断，只告警 + 记进 service.diagnostics 供 doctor 展示）。
 *
 * 为什么只比 id：
 *   - 行 id 是最稳的能力清单指纹；
 *   - 配置差异（如 sampleOverCapGlobResults）由生成器在升级时重新快照，不在这里逐字段比；
 *   - 解析用行扫描而不是 YAML 库：entry-list dump 的每行行首是 `- id:`，persona 是标量不会命中。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

/** 读内置快照（modes/base/<base>.plugins.json）。 */
export function loadSnapshot(base) {
  const file = path.join(repoRoot, 'modes', 'base', `${base}.plugins.json`)
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(data?.plugins)) throw new Error(`快照缺少 plugins：${file}`)
  return data
}

/** 快照里的全部行 id（含组内子行）。 */
export function snapshotIds(snapshot) {
  const out = []
  const walk = (rows) => {
    for (const row of rows ?? []) {
      if (row !== null && typeof row === 'object' && typeof row.id === 'string') out.push(row.id)
      if (row?.group === true && Array.isArray(row.config)) walk(row.config)
    }
  }
  walk(snapshot?.plugins ?? [])
  return out
}

/**
 * 从 `agentPresets.readDocument()` 的 YAML 文本里取行 id。
 * 只认行首（可带缩进）的 `- id:`，所以块标量正文不会误命中。
 */
export function idsFromDocument(content) {
  const ids = []
  for (const line of String(content ?? '').split('\n')) {
    const match = /^\s*-\s+id:\s*(?:'([^']*)'|"([^"]*)"|([^\s#]+))/.exec(line)
    if (!match) continue
    const id = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (id !== '') ids.push(id)
  }
  return ids
}

/**
 * 对比一个内置预设的「运行时行 id」与快照。
 * @param {object} agentPresets agentPresets 服务（需 readDocument）
 * @param {string} base standard | cordis
 */
export async function checkPresetDrift(agentPresets, base) {
  const snapshot = loadSnapshot(base)
  const expected = snapshotIds(snapshot)
  let content = ''
  try {
    const doc = await agentPresets.readDocument(base)
    content = typeof doc?.content === 'string' ? doc.content : ''
  } catch (error) {
    return {
      base,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      expected,
      live: [],
      missing: expected,
      extra: [],
    }
  }
  const live = idsFromDocument(content)
  const liveSet = new Set(live)
  const expectedSet = new Set(expected)
  const missing = expected.filter((id) => !liveSet.has(id))
  const extra = live.filter((id) => !expectedSet.has(id))
  return {
    base,
    dshVersion: snapshot.dshVersion,
    ok: missing.length === 0 && extra.length === 0,
    expected: expected.length,
    live: live.length,
    missing,
    extra,
  }
}

/**
 * 对比全部内置 base。
 * @param {object} agentPresets agentPresets 服务
 * @param {string[]} [bases]
 */
export async function checkDrift(agentPresets, bases = ['standard', 'cordis']) {
  const presets = []
  for (const base of bases) presets.push(await checkPresetDrift(agentPresets, base))
  return {
    ok: presets.every((item) => item.ok),
    checkedAt: Date.now(),
    presets,
  }
}
