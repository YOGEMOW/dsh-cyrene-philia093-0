/**
 * 聊天模式定义（薄组合）。
 *
 * base  = 内置 standard（能力行在构建时从 modes/base/standard.plugins.json 读取）
 * persona = persona/chat.md（逐字，来自退役插件）
 * 档位 = sealed（见 docs/CONTRACT.md 第 2 节）
 *
 * 第 3 步起在 tail 追加：runtime 轨道、能力总则、计划桥、世界书、称呼、风格、场景。
 */
export default {
  id: 'chat',
  loaderId: 'preset-cyrene-chat',
  order: 5,
  name: '昔涟聊天模式',
  description: '昔涟（Cyrene）陪聊：sealed 人设 + 标准模式全能力（能力总则与计划桥恢复规范）。',
  base: 'standard',
  persona: 'persona/chat.md',
  tail: [],
}
