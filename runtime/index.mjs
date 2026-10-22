/**
 * dsh-cyrene-philia093-0 / 预设作用域运行时（第 3 步：记忆轨道 + 能力总则）。
 *
 * 挂载方式：两个预设的 `plugins` 里各有一行
 *   { id: cyrene-runtime, name: 'dsh-cyrene-philia093-0/runtime' }
 * 因此本插件只属于「昔涟聊天模式」「德谬歌工作模式」，标准模式看不到任何昔涟工具/注入。
 *
 * 第 3 步范围：
 *   - 记忆轨道：{{cyrene_memory}} 常量指针 + pre-step 首轮快照/命中/压缩重注入；
 *   - 能力总则：sealed 下补回跨工具操作规则（context order 150）；
 *   - 计划桥：独立行 runtime/plan-bridge.mjs，由构建器插进 planning 隔离组。
 *
 * 第 4 步起：五育闸门工具、称呼/形态/风格/世界书轨道、月检/夜梦。
 */
import { installCapability } from './capability.mjs'
import { installMemoryRail } from './memory-rail.mjs'

export const name = 'dsh-cyrene-philia093-0/runtime'
export const inject = []

/** 预设行入口。 */
export function apply(ctx) {
  // 能力总则：只依赖 systemPrompt。
  try {
    ctx.inject(['systemPrompt'], (scope) => {
      installCapability(scope)
    })
  } catch (error) {
    ctx?.logger?.warn?.(`[cyrene-runtime] 能力总则安装失败：${error instanceof Error ? error.message : String(error)}`)
  }

  // 记忆轨道：依赖宿主 cyreneMemory 服务。宿主没起来就静默跳过（fail-open）。
  try {
    ctx.inject(['systemPrompt', 'cyreneMemory'], (scope) => {
      installMemoryRail(scope, scope.cyreneMemory)
    })
  } catch (error) {
    ctx?.logger?.warn?.(`[cyrene-runtime] 记忆轨道安装失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
