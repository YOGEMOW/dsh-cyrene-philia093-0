/**
 * 称呼轨道（nickname rail）。
 *
 * 从退役插件的 nickname.js 迁入，按新契约做了两处调整：
 *   1. 存储改为 `<root>/元/nickname.json`（不再读写别的插件的 dsha-brand-rename.json；
 *      只在自家存储没有值时**只读**一次旧文件做兼容）；
 *   2. root 由宿主 `cyreneMemory` 服务提供，不再手拼 DSH_HOME。
 *
 * 通道：variable `user_nickname` + context order 120 + pre-step 显式改口 + set_nickname 工具。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeJSON, readJSON } from '../memory/store.js'
import { BUDGETS, ORDERS, clip } from './rails.mjs'

export const DEFAULT_NICKNAME = '伙伴'
const MAX_LENGTH = 24

/** 旧昵称插件的共享文件（只读兼容）。 */
function legacyBrandFile() {
  const home = (process.env.DSH_HOME || '').trim() || join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')
  return join(home, 'dsha-brand-rename.json')
}

/** 清洗称呼：最终会拼进提示词，不能带换行/花括号/控制字符。 */
export function sanitize(value) {
  if (typeof value !== 'string') return ''
  const cleaned = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
  return cleaned === '' ? '' : cleaned.slice(0, MAX_LENGTH)
}

function storePath(root) {
  return join(root, '元', 'nickname.json')
}

/** 读称呼：自家存储优先，旧共享文件只读兼容，最后默认值。 */
export function loadNickname(root) {
  try {
    const own = readJSON(storePath(root), null)
    const value = sanitize(own?.nickname)
    if (value !== '') return value
  } catch {
    /* ignore */
  }
  try {
    const legacy = legacyBrandFile()
    if (existsSync(legacy)) {
      const value = sanitize(JSON.parse(readFileSync(legacy, 'utf8'))?.nickname)
      if (value !== '') return value
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_NICKNAME
}

/** 写称呼（只写自家存储；读-改-写保留 relationshipPush 等字段）。 */
export function saveNickname(root, value) {
  const name = sanitize(value)
  if (name === '') return ''
  let current = {}
  try {
    const parsed = readJSON(storePath(root), null)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) current = parsed
  } catch {
    current = {}
  }
  const ok = writeJSON(storePath(root), { ...current, nickname: name })
  return ok ? name : ''
}

/** 关系称呼推进（默认关；环境变量或 元/nickname.json 打开）。 */
export function relationshipPushEnabled(root) {
  if (process.env.DSH_CYRENE_RELATIONSHIP_PUSH === '1') return true
  try {
    return readJSON(storePath(root), null)?.relationshipPush === true
  } catch {
    return false
  }
}

/** 捕获到的候选词里出现这些，说明多半是在问「叫什么」。 */
const NOT_A_NAME = new Set(['什么', '啥', '谁', '哪个', '名字', '一声', '一下'])
const TAIL_NOISE = /[吧呀啊哦嘛呢啦哈咯～~\s了。．.!！?？,，、;；:：]+$/u

/** 从用户这句话里解析**显式**改口请求。 */
export function extractNicknameRequest(text) {
  const source = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (source === '') return ''
  if (/(?:别|不要|不用|甭)(?:再)?\s*(?:叫我|喊我|称呼我)/.test(source)) return ''
  const patterns = [
    /(?:以后|往后|从现在(?:起|开始)|从今天(?:起|开始))?\s*(?:就)?(?:叫我|喊我|称呼我|管我叫)\s*[「『"'“]?([^」』"'”\s，。！？,.!?；;：:（()）]{1,12})/u,
    /(?:把|将)?(?:对我的)?(?:称呼|昵称)(?:改成|换成|改为|换为|叫成)\s*[「『"'“]?([^」』"'”\s，。！？,.!?；;：:（()）]{1,12})/u,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(source)
    if (!match) continue
    const name = match[1].trim().replace(TAIL_NOISE, '').replace(/^(?:一声|一下)/u, '').trim()
    if (name === '' || NOT_A_NAME.has(name)) continue
    if (/[什么啥谁吗呢]/u.test(name)) continue
    const clean = sanitize(name)
    if (clean !== '') return clean
  }
  return ''
}

/** 取本轮最后一条真实用户消息。 */
function latestUserText(messages) {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.role !== 'user' || message?.source?.kind !== 'user') continue
    const text = (Array.isArray(message.content) ? message.content : [])
      .filter((block) => block?.type === 'text')
      .map((block) => String(block.text ?? ''))
      .join('\n')
      .trim()
    if (text !== '') return text
  }
  return ''
}

/** 称呼规则（context order 120）。 */
export function nicknameContext(root) {
  const lines = [
    '【称呼】',
    `你现在称呼对方为「${loadNickname(root)}」。`,
    '- 对方**明确**要求改口（「以后叫我 ××」「称呼改成 ××」）时，直接用新称呼。',
    '- 平时保持当前称呼，不要自己往更亲密或关系称谓上推。',
  ]
  if (relationshipPushEnabled(root)) {
    lines.push(
      '- 对方用**关系称呼**暗示时，把称呼换成对应的那一个；对方没往这个方向走，就别自己往关系上推。',
    )
  }
  return lines.join('\n')
}

/** 设置称呼的工具（给人看的结果文本）。 */
export function setNickname(root, value) {
  const name = saveNickname(root, value)
  if (name === '') return '称呼没有改成功：名字不能为空，也不能带换行或花括号。'
  return `称呼已改为「${name}」。从这个称呼开始，之后都这么叫。`
}

/** 工具描述符。 */
function setNicknameTool(root) {
  return {
    name: 'set_nickname',
    description:
      '更改你称呼对方的方式。对方明确要求改口（「以后叫我老师」）或用暗示表达希望换称呼时使用；'
      + '只在确实要改时调用，不要因为一句玩笑就改；改完当轮就用新称呼。',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: '新称呼，例如「老师」「小明」' } },
      required: ['name'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
    },
    execute: (args) => setNickname(root, args?.name),
  }
}

/**
 * 安装称呼轨道。
 * @param ctx 预设作用域上下文（需 systemPrompt）
 * @param service 宿主 cyreneMemory 服务
 * @param config { trace?: boolean }
 */
export function installNickname(ctx, service, config = {}) {
  const root = service?.root
  if (typeof root !== 'string' || root === '') return () => {}
  const disposers = []
  const variable = ctx?.systemPrompt?.variable?.('user_nickname', () => loadNickname(root))
  if (typeof variable === 'function') disposers.push(variable)

  const context = ctx?.systemPrompt?.context?.({
    name: 'cyrene:nickname',
    order: ORDERS.nickname,
    text: () => clip(nicknameContext(root), BUDGETS.nicknameContext),
  })
  if (typeof context === 'function') disposers.push(context)

  const preStep = ctx?.on?.('agent/pre-step', async (payload, next) => {
    const decision = await next()
    try {
      if (decision?.kind !== 'enter') return decision
      const text = latestUserText(payload?.messages)
      if (text === '') return decision
      const wanted = extractNicknameRequest(text)
      if (wanted === '') return decision
      const before = loadNickname(root)
      if (wanted === before) return decision
      const saved = saveNickname(root, wanted)
      if (config.trace === true) {
        ctx?.logger?.info?.(`[cyrene-nickname] 显式改口：${before} → ${saved || '(写入失败)'}`)
      }
      return decision
    } catch {
      return decision
    }
  }, { prepend: true })
  if (typeof preStep === 'function') disposers.push(preStep)

  try {
    ctx?.inject?.(['tools'], (scope) => {
      scope.tools.register(setNicknameTool(root))
    })
  } catch {
    /* 没有 tools 服务时只读 */
  }

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* ignore */
      }
    }
  }
}
