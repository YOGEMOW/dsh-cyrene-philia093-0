/**
 * 定时备份：把记忆根目录整体快照到 <DSH_HOME>/cyrene-philia093-0-snapshots/YYYY-MM-DD，
 * 并保留最近 N 份。只做本地冷备；思源镜像由 lib/siyuan.js 负责。
 */

import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 快照父目录（与记忆根同级）。 */
export function snapshotsDir(root) {
  return join(dirname(root), 'cyrene-philia093-0-snapshots')
}

/** 快照目录改名迁移：旧 `cyrene-memory-snapshots` → 新目录（只在新目录不存在时）。 */
export function migrateSnapshotsDir(root) {
  try {
    const target = snapshotsDir(root)
    if (existsSync(target)) return { ok: true, migrated: false }
    const legacy = join(dirname(target), 'cyrene-memory-snapshots')
    if (!existsSync(legacy)) return { ok: true, migrated: false }
    renameSync(legacy, target)
    return { ok: true, migrated: true, from: legacy, to: target }
  } catch (error) {
    return { ok: false, migrated: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** 本地日期（与 dream/dayOf 同语义）。 */
function dayOf(now) {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 目录字节数（估算，失败返回 0）。 */
export function dirSize(path) {
  let total = 0
  try {
    const stack = [path]
    while (stack.length > 0) {
      const cur = stack.pop()
      let names = []
      try {
        names = readdirSync(cur, { withFileTypes: true })
      } catch {
        continue
      }
      for (const ent of names) {
        const p = join(cur, ent.name)
        try {
          if (ent.isDirectory()) stack.push(p)
          else total += statSync(p).size
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return total
}

/** 列出已有快照（按日期升序）。 */
export function listSnapshots(root) {
  const dir = snapshotsDir(root)
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}/.test(e.name))
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * 建今日快照（同一天只建一次）。保留最近 keep 份。
 * @returns { ok, path?, skipped?, pruned[], error? }
 */
export function snapshotRoot(root, options = {}) {
  const keep = Number.isFinite(options.keep) ? Math.max(1, Math.min(60, options.keep)) : 7
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const force = options.force === true
  const name = dayOf(now)
  const dir = snapshotsDir(root)
  const dest = join(dir, name)
  try {
    if (existsSync(dest) && force !== true) return { ok: true, skipped: true, path: dest, pruned: [] }
    mkdirSync(dir, { recursive: true })
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    cpSync(root, dest, {
      recursive: true,
      filter: (src) => {
        // 日志类不进快照（省空间，且不是记忆内容）
        return !/[\\/]元[\\/](注入\.log|思源镜像\.log|梦\.log)$/.test(src)
      }
    })
    const all = listSnapshots(root)
    const pruned = []
    while (all.length > keep) {
      const oldest = all.shift()
      try {
        rmSync(join(dir, oldest), { recursive: true, force: true })
        pruned.push(oldest)
      } catch {
        /* ignore */
      }
    }
    return { ok: true, path: dest, pruned }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), pruned: [] }
  }
}
