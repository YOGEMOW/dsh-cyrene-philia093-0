/**
 * dsh-cyrene-philia093-0 / 宿主半体（第 0 步骨架）
 *
 * 宿主半体负责：
 *   - 记忆引擎服务（跨会话、夜梦调度、迁移、配额、诊断）
 *   - 生成漂移检测（对比内置 standard/cordis 与构建时快照）
 *   - persona 指纹与 /cyrene doctor
 *
 * 第 0 步只提供可加载的包锚点，不注册任何服务、不写任何文件。
 * 记忆引擎在第 1 步迁入；预设声明在第 2 步由构建器生成。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** 插件 id（与 package.json 的 dsh.id、cordis.patch.yml 的条目 id 一致）。 */
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

/** 第 0 步不注入任何宿主服务。 */
export const inject = []

/**
 * 插件加载钩子。
 * @param ctx - 宿主插件上下文。
 */
export function apply(ctx) {
  ctx?.logger?.info?.(
    `[${name}] v${version} 骨架已加载（第 0 步：仓库/契约/基线）。`
      + '预设声明与记忆引擎将在后续步骤接入；在此之前请勿安装到 profile。'
  )
}
