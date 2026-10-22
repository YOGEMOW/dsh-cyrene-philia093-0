/**
 * 工作模式定义（薄组合）。
 *
 * base  = 内置 cordis（= standard + tool-cordis + agent-preset 技能 + plugin_manager）
 * persona = persona/work.md（逐字，来自退役插件）
 * 档位 = sealed
 *
 * 第 3 步起在 tail 追加：runtime 轨道、能力总则、计划桥、世界书。
 * 风格/场景按原约定不挂工作模式（见 docs/CONTRACT.md 第 4 节与设计文档）。
 */
export default {
  id: 'cyrene-work',
  loaderId: 'preset-cyrene-work',
  order: 6,
  name: '德谬歌工作模式',
  description: '昔涟（Cyrene）与你干活：sealed 人设 + 创造模式全能力（含工具/技能/插件管理）。',
  base: 'cordis',
  persona: 'persona/work.md',
  tail: [],
}
