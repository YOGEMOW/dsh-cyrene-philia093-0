/**
 * dsh-cyrene-philia093-0 / 预设作用域运行时。
 *
 * 挂载方式：两个预设的 `plugins` 里各有一行
 *   { id: cyrene-runtime, name: 'dsh-cyrene-philia093-0/runtime', config: { rails: {...} } }
 * 因此本插件只属于「昔涟聊天模式」「德谬歌工作模式」，标准模式看不到任何昔涟工具/注入。
 *
 * 轨道（全部 sealed 友好：variable / context / pre-step）：
 *   - capability（order 150）：跨工具操作规则；
 *   - memory（variable + pre-step）：{{cyrene_memory}} 指针、快照、命中、压缩重注入；
 *   - nickname（order 120）：称呼规则 + user_nickname + set_nickname；
 *   - scene（order 125）：形态 + 场景切换；
 *   - style（order 130）：道韵/风格档位（仅聊天模式挂）；
 *   - worldbook（order 140）：世界书常驻 + 命中。
 *   - tools：memory_* / remember / forget（preset 作用域）。
 *   - plan-bridge：独立行 runtime/plan-bridge.mjs，由构建器插进 planning 隔离组。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { installCapability } from './capability.mjs'
import { installCommands } from './commands.mjs'
import { installMemoryRail } from './memory-rail.mjs'
import { installSectionMirror } from './section-mirror.mjs'
import { installNickname } from './nickname.mjs'
import { registerMemoryTools } from './tools.mjs'
import { apply as applyScene } from './scene.mjs'
import { apply as applyStyle } from './style.mjs'
import { apply as applyWorldbook } from './worldbook/index.mjs'

export const name = 'dsh-cyrene-philia093-0/runtime'
export const inject = []

/** 默认轨道开关（聊天模式全开；工作模式由构建器关掉称呼/风格/场景）。 */
const DEFAULT_RAILS = { nickname: true, style: true, scene: true, worldbook: true }

/** 版本号（doctor 展示）。 */
const VERSION = (() => {
  try {
    const parsed = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    return typeof parsed?.version === 'string' ? parsed.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

/**
 * 预设行入口。
 * @param ctx 预设作用域上下文
 * @param config 行配置：{ rails?: {nickname,style,scene,worldbook}, trace?, worldbook? }
 */
export function apply(ctx, config = {}) {
  const rails = { ...DEFAULT_RAILS, ...(config?.rails ?? {}) }
  const root = () => ctx?.get?.('cyreneMemory')?.root ?? ''

  // 能力总则：只依赖 systemPrompt。
  try {
    ctx.inject(['systemPrompt'], (scope) => {
      installCapability(scope)
    })
  } catch (error) {
    ctx?.logger?.warn?.(`[cyrene-runtime] 能力总则安装失败：${error instanceof Error ? error.message : String(error)}`)
  }

  // 依赖宿主记忆服务的轨道。
  try {
    ctx.inject(['systemPrompt', 'cyreneMemory'], (scope) => {
      const service = scope.cyreneMemory

      // 截面镜像：在 sealed 吞掉之前拿到全部 section，以 context 原样回注。
      try {
        installSectionMirror(scope, service, config?.sectionMirror)
      } catch (error) {
        ctx?.logger?.warn?.(`[cyrene-runtime] 截面镜像失败：${error instanceof Error ? error.message : String(error)}`)
      }

      try {
        installMemoryRail(scope, service)
      } catch (error) {
        ctx?.logger?.warn?.(`[cyrene-runtime] 记忆轨道失败：${error instanceof Error ? error.message : String(error)}`)
      }

      if (rails.nickname === true) {
        try {
          installNickname(scope, service, { trace: config?.trace === true })
        } catch (error) {
          ctx?.logger?.warn?.(`[cyrene-runtime] 称呼轨道失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (rails.scene === true) {
        try {
          applyScene(scope, { trace: config?.trace === true })
        } catch (error) {
          ctx?.logger?.warn?.(`[cyrene-runtime] 形态/场景轨道失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (rails.style === true) {
        try {
          applyStyle(scope, {
            storePath: join(root(), '元', 'style.json'),
            customPath: join(root(), '元', 'style-custom.md'),
            trace: config?.trace === true,
          })
        } catch (error) {
          ctx?.logger?.warn?.(`[cyrene-runtime] 风格轨道失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (rails.worldbook === true) {
        try {
          applyWorldbook(scope, { root: root(), worldbook: config?.worldbook })
        } catch (error) {
          ctx?.logger?.warn?.(`[cyrene-runtime] 世界书轨道失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }

      try {
        installCommands(scope, service, VERSION)
      } catch (error) {
        ctx?.logger?.warn?.(`[cyrene-runtime] 命令注册失败：${error instanceof Error ? error.message : String(error)}`)
      }
    })
  } catch (error) {
    ctx?.logger?.warn?.(`[cyrene-runtime] 轨道安装失败：${error instanceof Error ? error.message : String(error)}`)
  }

  // 记忆工具：preset 作用域注册，标准模式不可见。
  try {
    ctx.inject(['cyreneMemory'], (scope) => {
      registerMemoryTools(scope, scope.cyreneMemory)
    })
  } catch (error) {
    ctx?.logger?.warn?.(`[cyrene-runtime] 记忆工具注册失败：${error instanceof Error ? error.message : String(error)}`)
  }
}
