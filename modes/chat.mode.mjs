/**
 * 聊天模式定义（薄组合）。
 *
 * base  = 内置 standard（能力行在构建时从 modes/base/standard.plugins.json 读取）
 * persona = persona/chat.md（逐字，来自退役插件）
 * 档位 = sealed（见 docs/CONTRACT.md 第 2 节）
 *
 * tail / groupPatches = 昔涟的会话级插件（第 3 步起）：
 *   - cyrene-runtime：记忆轨道、能力总则、截面镜像；
 *   - cyrene-commands：/cyrene doctor、/memory、/dream（独立行，和 plan-mode 同一种组合方式）；
 *   - cyrene-plan-bridge：计划模式桥（必须在 planning 隔离组内）。
 */
export default {
  id: 'chat',
  loaderId: 'preset-cyrene-chat',
  order: 5,
  name: '昔涟聊天模式',
  description: '昔涟（Cyrene）陪聊：sealed 人设 + 标准模式全能力（能力总则与计划桥恢复规范）。',
  base: 'standard',
  persona: 'persona/chat.md',
  tail: [
    {
      id: 'cyrene-runtime',
      name: 'dsh-cyrene-philia093-0/runtime',
      config: {
        rails: { nickname: true, style: true, scene: true, worldbook: true },
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
