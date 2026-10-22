/**
 * 截面镜像（section mirror）—— 解决 sealed 吞掉未来 prompt section 的问题。
 *
 * 原理（已对照 0.2.1-rc.2 的 dsh-system-prompt 源码）：
 *   - `assemble()` 先组装**全部** section 并运行 `system-prompt/assemble` waterfall；
 *   - 之后才做 complete 恢复（只留 persona）；
 *   - 而 `contexts` 在 sealed 下不被过滤。
 *
 * 所以本模块监听装配 waterfall，在被吞掉之前拿到 section 全文，把它们以一条
 * context（interpolate:false）回注到上下文尾部。人设仍是唯一系统提示词段。
 *
 * 名字策略：
 *   - 永不镜像 `deployment:*`（含 persona 前缀/后缀）与 persona 正文；
 *   - 默认镜像 `tool:*` / `plan:*`（操作类）；
 *   - 未知名字：mirrorUnknown 为 true 且不命中 persona/identity/system/brand 时镜像；
 *   - mode=off 只观测不镜像；mode=allowlist 只镜像 allow 列表。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MAX_SECTION_CHARS = 1200
const DEFAULT_MAX_CHARS = 3000
const PERSONA_NAMES = new Set(['deployment:persona-prefix', 'deployment:persona-suffix'])
const RISKY_NAME = /(deployment|persona|identity|system|brand)/i
const AUTO_PREFIXES = ['tool:', 'plan:']

export const MIRROR_CONTEXT_NAME = 'cyrene:section-mirror'
const MIRROR_HEADER = '【被 sealed 吞掉的提示词段·自动镜像】\n（以下是 DSH 原生提示词段，只约束操作与流程，不改变你是谁、怎么说话。）'

/** 读两份 persona 正文（用于按内容识别 persona 段）。 */
function loadPersonaTexts() {
  const out = new Set()
  for (const rel of ['../persona/chat.md', '../persona/work.md']) {
    try {
      const text = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
      const normalized = text.replace(/\r\n?/g, '\n').trim()
      if (normalized !== '') out.add(normalized)
    } catch {
      /* 缺文件不阻塞 */
    }
  }
  return out
}

/** 归一化配置。 */
export function resolveMirrorConfig(raw) {
  const c = raw !== null && typeof raw === 'object' ? raw : {}
  const mode = c.mode === 'off' || c.mode === 'allowlist' ? c.mode : 'auto'
  const allow = Array.isArray(c.allow) ? c.allow.filter((name) => typeof name === 'string') : []
  const maxChars = Number.isFinite(Number(c.maxChars)) ? Math.max(200, Math.min(8000, Math.round(Number(c.maxChars)))) : DEFAULT_MAX_CHARS
  return { mode, allow, maxChars, mirrorUnknown: c.mirrorUnknown !== false }
}

/**
 * 判定一个 section 该不该镜像。
 * @returns {{ action:'mirror'|'skip', reason:string }}
 */
export function classifySection(section, config, personaTexts) {
  const name = typeof section?.name === 'string' ? section.name : ''
  const text = typeof section?.text === 'string' ? section.text.trim() : ''
  if (name === '' || text === '') return { action: 'skip', reason: 'empty' }
  if (PERSONA_NAMES.has(name)) return { action: 'skip', reason: 'persona' }
  if (personaTexts.has(text)) return { action: 'skip', reason: 'persona-text' }
  if (RISKY_NAME.test(name)) return { action: 'skip', reason: 'persona-risk' }
  if (config.mode === 'off') return { action: 'skip', reason: 'mode-off' }
  if (config.mode === 'allowlist') {
    return config.allow.includes(name) ? { action: 'mirror', reason: 'allowlist' } : { action: 'skip', reason: 'not-allowed' }
  }
  if (AUTO_PREFIXES.some((prefix) => name.startsWith(prefix))) return { action: 'mirror', reason: 'auto' }
  if (config.mirrorUnknown) return { action: 'mirror', reason: 'unknown-auto' }
  return { action: 'skip', reason: 'unknown' }
}

/**
 * 组装镜像块。
 * @returns {{ text:string, mirrored:Array<{name:string,chars:number}>, skipped:Array<{name:string,reason:string}>, truncated:boolean }}
 */
export function buildMirrorBlock(sections, config, personaTexts) {
  const mirrored = []
  const skipped = []
  const parts = []
  let used = 0
  let truncated = false
  for (const section of Array.isArray(sections) ? sections : []) {
    const verdict = classifySection(section, config, personaTexts)
    if (verdict.action === 'skip') {
      if (section?.name !== undefined) skipped.push({ name: String(section.name), reason: verdict.reason })
      continue
    }
    const name = String(section.name)
    let text = String(section.text ?? '').trim()
    if (text.length > MAX_SECTION_CHARS) {
      text = `${text.slice(0, MAX_SECTION_CHARS - 1)}…`
      truncated = true
    }
    const block = `## ${name}\n${text}`
    if (used + block.length > config.maxChars) {
      const room = config.maxChars - used
      if (room < 80) {
        truncated = true
        skipped.push({ name, reason: 'budget' })
        continue
      }
      parts.push(`${block.slice(0, room - 1)}…`)
      used = config.maxChars
      truncated = true
      mirrored.push({ name, chars: room })
      break
    }
    parts.push(block)
    used += block.length
    mirrored.push({ name, chars: block.length })
  }
  const text = parts.length === 0 ? '' : `${MIRROR_HEADER}\n\n${parts.join('\n\n')}`
  return { text, mirrored, skipped, truncated }
}

/**
 * 安装截面镜像。
 * @param ctx 预设作用域上下文（需 on/logger；systemPrompt 用于确认服务在）
 * @param service cyreneMemory 服务（用于 diagnostics）
 * @param rawConfig 行配置 { sectionMirror?: { mode, allow, maxChars, mirrorUnknown } }
 * @returns disposer
 */
export function installSectionMirror(ctx, service, rawConfig) {
  if (typeof ctx?.on !== 'function') return () => {}
  const config = resolveMirrorConfig(rawConfig)
  const personaTexts = loadPersonaTexts()
  if (service !== undefined && service !== null && typeof service.diagnostics === 'object') {
    service.diagnostics.sections = null
  }

  const listener = async (assembly, context, next) => {
    let out
    try {
      out = await next()
    } catch (error) {
      throw error
    }
    try {
      const sections = Array.isArray(out?.sections) ? out.sections : []
      const built = buildMirrorBlock(sections, config, personaTexts)
      if (service?.diagnostics !== undefined) {
        service.diagnostics.sections = {
          at: Date.now(),
          mode: config.mode,
          seen: sections.length,
          mirrored: built.mirrored,
          skipped: built.skipped,
          truncated: built.truncated,
          totalChars: built.text.length,
        }
      }
      if (built.text === '') return out
      const contexts = Array.isArray(out?.contexts) ? out.contexts : []
      return {
        ...out,
        contexts: [...contexts, { name: MIRROR_CONTEXT_NAME, text: built.text, interpolate: false }],
      }
    } catch (error) {
      ctx?.logger?.warn?.(`[cyrene-section-mirror] 镜像失败（已放行）：${error instanceof Error ? error.message : String(error)}`)
      return out
    }
  }

  return ctx.on('system-prompt/assemble', listener)
}
