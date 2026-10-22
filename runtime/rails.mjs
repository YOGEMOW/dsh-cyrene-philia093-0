/**
 * 运行时轨道共用件：注入顺序、预算、插件消息与文本工具。
 *
 * 设计约束（见 docs/CONTRACT.md 第 4 节）：
 *   - 两个预设都是 sealed：**只有 context / variable / pre-step 三条通道**；
 *   - context order 保留区间 100–199；
 *   - 所有注入都是「数据/操作规则，不是身份」。
 */
import { randomUUID } from 'node:crypto'

/** 注入消息的 source.kind（会话历史里可区分来源）。 */
export const PLUGIN_KIND = 'plugin:cyrene-philia093-0'

/** context 注入顺序（契约第 4 节）。 */
export const ORDERS = Object.freeze({
  nickname: 120,
  form: 125,
  style: 130,
  worldbook: 140,
  capability: 150,
  planBridge: 155,
})

/** 各轨道的字符预算（契约第 4 节）。 */
export const BUDGETS = Object.freeze({
  memoryPointer: 1200,
  hitBlock: 1000,
  nickname: 64,
  nicknameContext: 400,
  form: 200,
  style: 400,
  worldbookPermanent: 560,
  capability: 1300,
  planBridge: 300,
})

/** 从消息 content 取纯文本。 */
export function textOf(message) {
  const content = message?.content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/**
 * 构造注入用的 plugin 消息。
 * id 必须自己生成（缺 id 会让会话历史加载失败）；source.kind 用于区分来源。
 * @param {string} text
 * @param {string} [sectionName]
 */
export function createPluginMessage(text, sectionName = '一页永恒') {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: PLUGIN_KIND,
      form: 'snapshot',
      sections: [{ name: sectionName, text }],
    },
  }
}

/** 按预算截断（保留换行，末尾标注）。 */
export function clip(text, maxChars) {
  const value = typeof text === 'string' ? text : ''
  if (!Number.isFinite(maxChars) || maxChars <= 0 || value.length <= maxChars) return value
  const cut = value.slice(0, Math.max(0, maxChars - 18))
  const at = cut.lastIndexOf('\n')
  return `${at > 0 ? cut.slice(0, at) : cut}\n…（已截断）`
}
