/**
 * 宿主侧记忆服务（纯函数工厂，不依赖 DSH ctx）。
 *
 * 第 1 步先把引擎与数据服务封成一个可测试的对象；第 3 步再在 host/index.mjs 里
 * 用 `ctx.provide('cyreneMemory', service)` 暴露给 runtime 轨道。
 *
 * 设计要点：
 *   - 根目录解析永不落 CWD（见 memory/store.js resolveRoot）；
 *   - 所有写操作走 memory/store 的原子写；
 *   - 失败一律 fail-open：返回 { ok:false, errors }，不抛给会话链路。
 */
import { resolveConfig } from '../memory/config.js'
import path from 'node:path'
import {
  appendEntry,
  ensureTree,
  listDays,
  quotaUsage,
  readAnchor,
  readDay,
  readJSON,
  resolveRoot,
  walkFiles,
  writeAnchor,
  writeJSON,
} from '../memory/store.js'

/**
 * @param {{ rootDir?: string, config?: object }} [options]
 * @returns 记忆服务对象
 */
export function createMemoryService(options = {}) {
  const config = resolveConfig(options.config)
  const rootDir = typeof options.rootDir === 'string' && options.rootDir.trim() ? options.rootDir.trim() : config.rootDir
  const root = resolveRoot(rootDir)

  return {
    root,
    config,

    /** 建目录树 + 锚点占位（幂等）。 */
    ensure() {
      return ensureTree(root)
    },

    /** 追加/覆盖一条 Entry。 */
    append(entry) {
      return appendEntry(root, entry)
    },

    /** 列出全部日档日期。 */
    days() {
      return listDays(root)
    },

    /** 读某一天日档。 */
    day(date) {
      return readDay(root, date)
    },

    /** 读全部条目（日档顺序）。 */
    allEntries() {
      const out = []
      for (const date of listDays(root)) {
        const parsed = readDay(root, date)
        for (const entry of parsed.entries || []) out.push(entry)
      }
      return out
    },

    /** 配额统计。 */
    quota() {
      return quotaUsage(root)
    },

    /** 读四问锚点（self/user/origin/goal）。 */
    anchor(which) {
      return readAnchor(root, which)
    },

    /** 写四问锚点。 */
    setAnchor(which, content, meta) {
      return writeAnchor(root, which, content, meta)
    },

    /** 遍历记忆文件（posix 相对路径）。 */
    files() {
      return walkFiles(root)
    },

    /** 读/写 `元/` 下的 JSON 元数据（卷、迁移报告等由专用脚本写，这里只读）。 */
    readMeta(name, fallback = null) {
      return readJSON(path.join(root, '元', name), fallback)
    },

    /** 迁移/诊断脚本用：写 `元/` 下的 JSON。 */
    writeMeta(name, value) {
      return writeJSON(path.join(root, '元', name), value)
    },
  }
}
