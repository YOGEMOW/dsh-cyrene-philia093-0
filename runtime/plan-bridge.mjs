/**
 * 计划模式桥（plan bridge）。
 *
 * `@deepseek-ai/dsh-plan-mode` 挂载后会注册一个提示词 section（计划规则）；但在 sealed
 * 预设里 section 会被 persona 的 complete 恢复逻辑压掉。于是本行：
 *   - 必须放在同一个 `planning` 隔离组内（共享 `planMode` 服务 realm）；
 *   - 用 `systemPrompt.context()`（order 155）在计划模式激活时补回一段精简规则。
 *
 * 不复制部署配置里的 section 原文：用自己的精简版，避免上游文案变更后漂移。
 */
import { BUDGETS, ORDERS, clip } from './rails.mjs'

export const PLAN_BRIDGE_TEXT = `【计划模式】当前处于计划模式：先只读探索（读文件、搜索、静态检查），再给出决策完整的计划（目标与成功标准、分步改动、风险、验证方式），用 exit_plan_mode 提交。未获批准前不要执行修改，也不要用 todo 代替计划。`

/**
 * 注册计划桥 context。
 * @param ctx 预设作用域上下文
 * @param planMode `ctx.planMode` 服务（提供 get(agent) → { active, pending? }）
 * @returns disposer
 */
export function installPlanBridge(ctx, planMode) {
  if (ctx?.systemPrompt?.context === undefined || planMode === undefined) return () => {}
  return ctx.systemPrompt.context({
    name: 'cyrene:plan-bridge',
    order: ORDERS.planBridge,
    text: (context) => {
      try {
        const agent = context?.agent
        if (agent === undefined) return ''
        const state = planMode.get(agent)
        return state?.active === true ? clip(PLAN_BRIDGE_TEXT, BUDGETS.planBridge) : ''
      } catch {
        return ''
      }
    },
  })
}

export const inject = ['systemPrompt', 'planMode']

/** 预设行入口。 */
export function apply(ctx) {
  ctx.inject(['systemPrompt', 'planMode'], (scope) => installPlanBridge(scope, scope.planMode))
}
