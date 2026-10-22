/**
 * dsh-cyrene-philia093-0 / 宿主半体（第 3 步：提供记忆服务）。
 *
 * 职责边界：
 *   - Host：记忆根目录、配置、`cyreneMemory` 服务（跨会话、可被多个预设消费）；
 *   - Preset（runtime）：注入轨道与工具，只对 chat / cyrene-work 生效。
 *
 * 第 3 步只提供 service + 建树；夜梦调度、思源镜像、备份、doctor 在第 4/6 步接入。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { resolveConfig } from '../memory/config.js'
import { createMemoryService } from './memory-service.mjs'
import { checkDrift } from './drift.mjs'
import { installDream } from './dream.mjs'
import { installMaintenance } from './maintenance.mjs'

export const name = 'dsh-cyrene-philia093-0'

/** 版本号从 package.json 读，避免多处手写不同步。 */
export const version = (() => {
  try {
    const file = fileURLToPath(new URL('../package.json', import.meta.url))
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return typeof parsed?.version === 'string' && parsed.version !== '' ? parsed.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

/** 不强制依赖任何宿主服务（服务缺失也要能加载）。 */
export const inject = []

/**
 * 宿主行入口。
 * @param ctx 宿主插件上下文
 * @param rawConfig Loader 行配置（可为 undefined）
 */
export function apply(ctx, rawConfig) {
  let service
  try {
    const config = resolveConfig(rawConfig)
    service = createMemoryService({ config })
    const tree = service.ensure()
    if (tree?.ok !== true) {
      ctx?.logger?.warn?.(`[${name}] 记忆目录初始化不完整：${(tree?.errors ?? []).join('；') || '未知原因'}`)
    }
    try {
      ctx.provide('cyreneMemory', service)
    } catch (error) {
      ctx?.logger?.warn?.(`[${name}] cyreneMemory 服务注册失败：${error instanceof Error ? error.message : String(error)}`)
    }
    ctx?.logger?.info?.(
      `[${name}] v${version} 记忆服务已就绪：${service.root}`
        + `（注入预设：${JSON.stringify(service.config.injectPresets)}；夜梦/镜像在第 4b/6 步接入）`
    )

    // 夜梦调度（默认开；schedule 服务不可用时只记日志）。
    try {
      installDream(ctx, service)
    } catch (error) {
      ctx?.logger?.warn?.(`[${name}] 夜梦调度安装失败（已跳过）：${error instanceof Error ? error.message : String(error)}`)
    }

    // 定时维护：思源镜像 + 每日快照 + 月度体检/滚动（默认开；全部 fail-open）。
    try {
      installMaintenance(ctx, service, rawConfig?.siyuan)
    } catch (error) {
      ctx?.logger?.warn?.(`[${name}] 定时维护安装失败（已跳过）：${error instanceof Error ? error.message : String(error)}`)
    }

    // 能力快照漂移检测：不阻断，只告警并记进 diagnostics（doctor 会展示）。
    try {
      ctx.inject(['agentPresets'], (scope) => {
        checkDrift(scope.agentPresets)
          .then((report) => {
            service.diagnostics.drift = report
            if (report.ok) {
              ctx?.logger?.info?.(`[${name}] 能力快照无漂移（standard/cordis）。`)
            } else {
              const detail = report.presets
                .filter((item) => !item.ok)
                .map((item) => `${item.base}: 缺 ${JSON.stringify(item.missing)} 多 ${JSON.stringify(item.extra)}${item.error ? ` 错误 ${item.error}` : ''}`)
                .join('；')
              ctx?.logger?.warn?.(`[${name}] 能力快照漂移：${detail}。请更新 modes/base 快照并 npm run build。`)
            }
          })
          .catch((error) => {
            service.diagnostics.lastError = error instanceof Error ? error.message : String(error)
            ctx?.logger?.warn?.(`[${name}] 漂移检测失败（已忽略）：${service.diagnostics.lastError}`)
          })
      })
    } catch (error) {
      ctx?.logger?.warn?.(`[${name}] 漂移检测未安装：${error instanceof Error ? error.message : String(error)}`)
    }
  } catch (error) {
    ctx?.logger?.warn?.(`[${name}] 记忆服务初始化失败（已降级为无记忆）：${error instanceof Error ? error.message : String(error)}`)
  }
}
