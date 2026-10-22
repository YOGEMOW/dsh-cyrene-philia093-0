/**
 * 工作模式定义（薄组合）。
 *
 * base  = 内置 cordis（= standard + tool-cordis + agent-preset 技能 + plugin_manager）
 * persona = persona/work.md（逐字，来自退役插件）
 * 档位 = sealed
 *
 * tail / groupPatches = 昔涟的会话级插件（第 3 步起）：
 *   - cyrene-runtime：记忆轨道、能力总则、截面镜像；
 *   - cyrene-commands：/cyrene doctor、/memory、/dream（独立行，和 plan-mode 同一种组合方式）；
 *   - cyrene-plan-bridge：计划模式桥（必须在 planning 隔离组内）。
 *
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
  tail: [
    {
      id: 'cyrene-runtime',
      name: 'dsh-cyrene-philia093-0/runtime',
      config: {
        rails: { nickname: false, style: false, scene: false, worldbook: true },
        sectionMirror: { mode: 'auto', maxChars: 3000, mirrorUnknown: true },
      },
    },
    {
      id: 'cyrene-commands',
      name: 'dsh-cyrene-philia093-0/runtime/commands',
    },
  ],
  groupPatches: {
    planning: [
      { id: 'cyrene-plan-bridge', name: 'dsh-cyrene-philia093-0/runtime/plan-bridge' },
    ],
  },
}
