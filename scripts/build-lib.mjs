/**
 * 构建器（纯函数）：把 modes/ + persona/ + 内置 base 快照合成 bundle 补丁。
 *
 * 为什么要在构建期合成：
 *   - DSH 的 preset 没有继承机制，只能整份声明；
 *   - 能力行必须跟随安装的 DSH，不能手抄（抄本会静默漂移）；
 *   - 人设是数据，不能和能力行写在同一处。
 *
 * 输出是 `cordis.patch.yml`（生成的，不要手改）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PLUGIN_NAME = 'dsh-cyrene-philia093-0'
const here = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(here, '..')

/** 读取内置 base 快照（modes/base/<name>.plugins.json）。 */
export function loadBase(name) {
  const file = path.join(repoRoot, 'modes', 'base', `${name}.plugins.json`)
  if (!fs.existsSync(file)) throw new Error(`缺少内置预设快照：${file}`)
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(data?.plugins)) throw new Error(`快照缺少 plugins：${file}`)
  return data
}

/** 读取 persona 正文（逐字）。 */
export function loadPersona(rel) {
  const file = path.join(repoRoot, rel)
  if (!fs.existsSync(file)) throw new Error(`缺少人设文件：${file}`)
  return fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n')
}

/** 载入全部 mode 定义（modes/*.mode.mjs，按文件名排序）。 */
export async function loadModes() {
  const dir = path.join(repoRoot, 'modes')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mode.mjs')).sort()
  const modes = []
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href)
    const def = mod.default
    if (!def || typeof def !== 'object') throw new Error(`mode 定义无效：${file}`)
    modes.push(def)
  }
  return modes
}

/**
 * 合成一个预设的声明对象（尚未渲染成 YAML）。
 * @param {object} mode
 * @returns {{loaderId: string, config: object}}
 */
export function buildDeclaration(mode) {
  const persona = loadPersona(mode.persona)
  const base = loadBase(mode.base)
  const rows = structuredClone(base.plugins)

  const personaRow = rows.find((row) => row?.id === 'persona')
  if (!personaRow) throw new Error(`${mode.base} 快照缺少 persona 行`)
  // sealed：只有 persona 前缀是系统提示词，suffix 不设置（设置了也不生效）。
  personaRow.config = {
    complete: true,
    includeRuntimeContext: true,
    prefix: persona,
  }
  for (const row of mode.tail ?? []) {
    if (rows.some((r) => r?.id === row?.id)) throw new Error(`${mode.id}: tail 行 id 重复：${row?.id}`)
    rows.push(structuredClone(row))
  }
  // 往内置预设的某个组里追加行（例：计划桥必须与 plan-mode 同处 planning 隔离组）。
  for (const [groupId, patchRows] of Object.entries(mode.groupPatches ?? {})) {
    const group = rows.find((row) => row?.id === groupId)
    if (!group) throw new Error(`${mode.id}: 找不到组 ${groupId}`)
    if (!Array.isArray(group.config)) throw new Error(`${mode.id}: ${groupId} 不是组（config 不是数组）`)
    for (const row of patchRows) {
      if (group.config.some((r) => r?.id === row?.id)) throw new Error(`${mode.id}/${groupId}: 组内行 id 重复：${row?.id}`)
      group.config.push(structuredClone(row))
    }
  }
  return {
    loaderId: mode.loaderId,
    config: {
      id: mode.id,
      name: mode.name,
      description: mode.description,
      order: mode.order,
      plugins: rows,
    },
  }
}

// ── YAML 渲染（零依赖，只覆盖 entry-list 方言） ──────────────────────────

/** 单引号 YAML 标量。 */
function quote(text) {
  return `'${String(text).replace(/'/g, "''")}'`
}

/** `!!js` 表达式：始终用双引号包住（DSH 自带预设也这么写带 `!` 的表达式）。 */
function renderJs(expr) {
  return `!!js ${JSON.stringify(String(expr))}`
}

function scalar(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : quote(String(value))
  if (value === null) return 'null'
  if (typeof value === 'string') return quote(value)
  throw new Error(`无法渲染标量：${typeof value}`)
}

/** 值是否走块标量（多行文本）。 */
function needsBlock(value) {
  return typeof value === 'string' && (value.includes('\n') || value.length > 200)
}

/**
 * 渲染一个 mapping 的值（key 在 indent 处，值缩进 2）。
 * @returns {string[]} 行数组
 */
function renderValue(key, value, indent) {
  const pad = ' '.repeat(indent)
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && '$js' in value) {
    return [`${pad}${key}: ${renderJs(value.$js)}`]
  }
  if (needsBlock(value)) {
    const lines = [`${pad}${key}: |`]
    const body = String(value).replace(/\n$/, '').split('\n')
    for (const line of body) lines.push(line === '' ? '' : `${' '.repeat(indent + 2)}${line}`)
    return lines
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}${key}: []`]
    const scalarish = (item) =>
      typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
      || (item !== null && typeof item === 'object' && !Array.isArray(item) && '$js' in item)
    if (value.every(scalarish)) {
      const rendered = value.map((item) => (item !== null && typeof item === 'object' && '$js' in item
        ? renderJs(item.$js)
        : scalar(item)))
      // 含 !!js 的数组走块序列，避免 flow 里混标签的兼容性风险。
      if (value.some((item) => item !== null && typeof item === 'object')) {
        return [`${pad}${key}:`, ...rendered.map((line) => `${' '.repeat(indent + 2)}- ${line}`)]
      }
      return [`${pad}${key}: [${rendered.join(', ')}]`]
    }
    return [`${pad}${key}:`, ...renderRows(value, indent + 2)]
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) return [`${pad}${key}: {}`]
    // 非行条目的小对象走 flow（如 isolate: {planMode: true}）
    const flat = entries.every(([, v]) => typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string')
      && entries.every(([, v]) => typeof v !== 'string' || (!v.includes('\n') && v.length <= 200))
    if (flat && entries.length <= 4) {
      return [`${pad}${key}: {${entries.map(([k, v]) => `${k}: ${scalar(v)}`).join(', ')}}`]
    }
    const out = [`${pad}${key}:`]
    for (const [k, v] of entries) out.push(...renderValue(k, v, indent + 2))
    return out
  }
  return [`${pad}${key}: ${scalar(value)}`]
}

/** 渲染一组 entry 行（每条以 `- id:` 开头）。 */
export function renderRows(rows, indent) {
  const out = []
  const pad = ' '.repeat(indent)
  for (const row of rows) {
    const known = new Set(['id', 'name', 'group', 'isolate', 'disabled', 'config'])
    for (const key of Object.keys(row)) if (!known.has(key)) throw new Error(`未知行字段：${key}`)
    out.push(`${pad}- id: ${quote(row.id)}`)
    if (row.name !== undefined) out.push(`${' '.repeat(indent + 2)}name: ${quote(row.name)}`)
    if (row.group === true) out.push(`${' '.repeat(indent + 2)}group: true`)
    if (row.isolate !== undefined) {
      out.push(...renderValue('isolate', row.isolate, indent + 2))
    }
    if (row.disabled !== undefined) {
      if (row.disabled === true || row.disabled === false) {
        out.push(`${' '.repeat(indent + 2)}disabled: ${row.disabled}`)
      } else if (row.disabled && typeof row.disabled === 'object' && '$js' in row.disabled) {
        out.push(`${' '.repeat(indent + 2)}disabled: ${renderJs(row.disabled.$js)}`)
      } else {
        throw new Error(`无法渲染 disabled：${JSON.stringify(row.disabled)}`)
      }
    }
    if (row.config !== undefined) out.push(...renderValue('config', row.config, indent + 2))
  }
  return out
}

const HEADER = `# dsh-cyrene-philia093-0 bundle patch
#
# ⚠️ 生成物，不要手改：由 scripts/build.mjs 从 modes/ + persona/ + modes/base/ 快照生成。
#    改人设 → 改 persona/*.md；改能力/模式 → 改 modes/*.mode.mjs；然后 npm run build。
#
# 两个预设都是 sealed（complete: true）：系统提示词只有 persona 前缀一段。
# 能力通过工具、变量、context 与 pre-step 消息恢复；不要给这两个预设加 prompt section。
`

/**
 * 渲染完整 patch 文本。
 * @param {Array} declarations
 * @returns {string}
 */
export function renderPatch(declarations) {
  const out = [HEADER, '- insert:', `    - id: ${quote(PLUGIN_NAME)}`, `      name: ${quote(PLUGIN_NAME)}`, '']
  for (const decl of declarations) {
    out.push('- insert:')
    out.push(`    - id: ${quote(decl.loaderId)}`)
    out.push(`      name: ${quote('@deepseek-ai/dsh-agent-preset')}`)
    out.push('      config:')
    const cfg = decl.config
    out.push(`        id: ${quote(cfg.id)}`)
    if (cfg.name !== undefined) out.push(`        name: ${quote(cfg.name)}`)
    if (cfg.description !== undefined) out.push(`        description: ${quote(cfg.description)}`)
    if (cfg.order !== undefined) out.push(`        order: ${cfg.order}`)
    out.push('        plugins:')
    out.push(...renderRows(cfg.plugins, 10))
    out.push('')
  }
  return `${out.join('\n').replace(/\s+$/, '')}\n`
}

/** 读取全部 mode、合成声明、渲染成完整 patch 文本。 */
export async function buildPatch() {
  const modes = await loadModes()
  const declarations = modes.map(buildDeclaration)
  const ids = declarations.map((d) => d.config.id)
  if (new Set(ids).size !== ids.length) throw new Error(`预设 id 重复：${ids.join(', ')}`)
  return renderPatch(declarations)
}
