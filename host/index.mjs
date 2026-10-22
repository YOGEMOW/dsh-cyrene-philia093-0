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
        + `（注入预设：${JSON.stringify(service.config.injectPresets)}；余梦/镜像在第 4/6 步接入）`
    )
  } catch (error) {
    ctx?.logger?.warn?.(`[${name}] 记忆服务初始化失败（已降级为无记忆）：${error instanceof Error ? error.message : String(error)}`)
  }
}
