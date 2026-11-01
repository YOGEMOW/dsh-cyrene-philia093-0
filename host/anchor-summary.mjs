/**
 * 锚点语义摘要器（宿主侧，best-effort）。
 *
 * 自动生命周期需要把旧「卷·日期」段概括到 ≤15 字。这里用宿主 llm 服务做真正的
 * 语义概括；缓存按原文 hash 存放，只有新归档段才调用模型。模型/服务不可用、
 * 输出不合法或超时都直接返回空 Map，让 memory/anchor.js 退回确定性截取。
 */
import path from 'node:path'

import { hashText } from '../memory/parse.js'
import { readJSON, writeJSON } from '../memory/store.js'

const CACHE_FILE = '元/锚点摘要.json'
const MAX_SUMMARY = 15

function cachePath(root) {
  return path.join(root, ...CACHE_FILE.split('/'))
}

function cleanJsonArray(text) {
  const raw = String(text ?? '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(raw.slice(start, end + 1))
    return Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

async function collectText(chunks) {
  let text = ''
  for await (const chunk of chunks) {
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') return ''
  }
  return text
}

/**
 * @param {object} ctx 宿主上下文
 * @param {string} root 记忆根
 * @param {string[]} blocks 原始「卷·日期」段
 * @param {object} options { signal? }
 * @returns {Promise<Map<string,string>>} 原文 → ≤15 字概括
 */
export async function summarizeAnchorBlocks(ctx, root, blocks, options = {}) {
  const unique = [...new Set((Array.isArray(blocks) ? blocks : []).filter((block) => typeof block === 'string' && block.trim() !== ''))]
  const map = new Map()
  if (unique.length === 0) return map
  const cache = readJSON(cachePath(root), {}) ?? {}
  const pending = unique.filter((block) => {
    const hit = cache[hashText(block)]
    if (typeof hit === 'string' && hit.trim() !== '') {
      map.set(block, hit)
      return false
    }
    return true
  })
  if (pending.length === 0) return map
  const llm = ctx?.get?.('llm')
  const selection = ctx?.get?.('agentDefaultModel')?.currentSelection?.()
  if (llm === null || typeof llm?.stream !== 'function' || typeof selection?.provider !== 'string' || typeof selection?.model !== 'string') {
    return map
  }
  const prompt = [
    '请阅读下面每一条锚点经历，概括成不超过 15 个汉字的中文摘要。',
    '要求：保留原意、不添加事实、不写成口号；每条只输出摘要文本；输出严格的 JSON 字符串数组，顺序与输入一致。',
    '',
    ...pending.map((block, index) => `${index + 1}. ${block}`),
  ].join('\n')
  try {
    const signal = options.signal ?? (typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(20000) : undefined)
    const text = await collectText(await llm.stream({
      provider: selection.provider,
      model: selection.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      maxTokens: Math.max(120, pending.length * 40),
      temperature: 0.2,
      ...(signal === undefined ? {} : { signal }),
    }))
    const arr = cleanJsonArray(text)
    if (arr === null || arr.length !== pending.length) return map
    for (let index = 0; index < pending.length; index += 1) {
      const summary = String(arr[index] ?? '').replace(/\s+/g, ' ').trim()
      if (summary === '') continue
      const clipped = Array.from(summary).slice(0, MAX_SUMMARY).join('')
      cache[hashText(pending[index])] = clipped
      map.set(pending[index], clipped)
    }
    if (map.size > 0) writeJSON(cachePath(root), cache)
  } catch {
    return map
  }
  return map
}



