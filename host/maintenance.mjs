/**
 * 定时维护（宿主管家）：思源镜像 + 每日快照 + 月度体检/日历滚动。
 *
 * 默认开（与一页永恒一致）：
 *   - 思源镜像：每 `backup.intervalMinutes`（默认 30）同步一次；本地是真相，思源是副本；
 *   - 每日快照：`backup.snapshotHour` 之后第一次 tick 做一次，保留 `backup.keep` 份；
 *   - 月度体检/月年滚动：同一 tick 内幂等执行。
 *
 * 全部 fail-open：任何外部依赖失败只写 `元/维护.log` 或 `元/思源镜像.log`，不影响会话。
 */
import { appendFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { loadEntries } from '../memory/entries.js'
import { readAnchors } from '../memory/anchor.js'
import { monthlyAudit } from '../memory/audit.js'
import { rollCalendars } from '../memory/rolling.js'
import { snapshotRoot } from '../memory/backup.js'
import { loadDreamState, saveDreamState } from '../memory/dream.js'
import {
  logMirror,
  loadMirrorState,
  resolveSiYuanConfig,
  syncAnchors,
  syncEntries,
  syncFreeArea,
  syncJournal,
} from '../memory/siyuan.js'
import { readTextSafe } from '../memory/store.js'

const DEFAULT_INTERVAL_MINUTES = 30
const ENTRY_SYNC_DAYS = 3
const JOURNAL_SYNC_DAYS = 7

function dayOf(now = Date.now()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 安装定时维护。
 * @param ctx 宿主上下文
 * @param service cyreneMemory 服务
 * @param rawSiyuan 行配置里的 siyuan 段
 * @returns disposer
 */
export function installMaintenance(ctx, service, rawSiyuan) {
  const root = service?.root
  const cfg = service?.config
  if (typeof root !== 'string' || root === '') return () => {}
  const siyuan = resolveSiYuanConfig(service?.config?.siyuan ?? rawSiyuan)
  const disposers = []
  const metaLog = (file, line) => {
    try {
      appendFileSync(join(root, '元', file), `[${new Date().toISOString()}] ${line}\n`)
    } catch {
      /* ignore */
    }
  }

  let lastMirrorAt = 0
  let lastMirrorError = ''

  /** 思源镜像：锚点 + 近 3 天条目 + 近 7 天梦志 + 余页。 */
  const runMirror = async () => {
    if (siyuan.enabled !== true) return { ok: true, skipped: true }
    try {
      const entries = loadEntries(root).entries.filter((entry) => entry?.sync !== false)
      const recent = entries.filter((entry) => {
        if (typeof entry?.day !== 'string') return false
        const cut = new Date(Date.now() - ENTRY_SYNC_DAYS * 86400000).toISOString().slice(0, 10)
        return entry.day >= cut
      })
      if (recent.length > 0) await syncEntries(siyuan, root, recent)
      const anchors = readAnchors(root)
      if (anchors !== undefined) await syncAnchors(siyuan, root, anchors)
      const journalDir = join(root, '梦')
      try {
        const names = readdirSync(journalDir)
          .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
          .sort()
          .slice(-JOURNAL_SYNC_DAYS)
        for (const name of names) {
          const day = name.replace(/\.md$/, '')
          const text = readTextSafe(join(journalDir, name))
          if (text.trim() !== '') await syncJournal(siyuan, root, day, text)
        }
      } catch {
        /* 梦目录不存在/读失败忽略 */
      }
      try {
        await syncFreeArea(siyuan, root)
      } catch {
        /* 余页镜像失败不阻塞 */
      }
      lastMirrorAt = Date.now()
      lastMirrorError = ''
      logMirror(root, `tick ok entries=${recent.length} anchors=1`)
      return { ok: true, entries: recent.length }
    } catch (error) {
      lastMirrorError = error instanceof Error ? error.message : String(error)
      logMirror(root, `tick failed ${lastMirrorError}`)
      return { ok: false, error: lastMirrorError }
    }
  }

  /** 每日快照 + 骨架维护；force=true 时忽略时点与"今天已备"限制（面板/命令手动触发）。 */
  const runBackup = (options = {}) => {
    if (cfg?.backup?.enabled !== true) return { ok: true, skipped: true }
    const force = options.force === true
    try {
      const hour = new Date().getHours()
      const state = loadDreamState(root)
      const today = dayOf()
      const due = force === true || (hour >= (cfg.backup.snapshotHour ?? 3) && state.lastSnapshotDate !== today)
      if (due) {
        const snap = snapshotRoot(root, { keep: cfg.backup.keep ?? 7, force })
        if (snap.ok === true) {
          state.lastSnapshotDate = today
          saveDreamState(root, state)
          metaLog('维护.log', `snapshot ok path=${snap.path} skipped=${snap.skipped === true} force=${force}`)
          return { ok: true, path: snap.path, skipped: snap.skipped === true }
        }
        metaLog('维护.log', `snapshot failed ${snap.error}`)
        return { ok: false, error: snap.error }
      }
      return { ok: true, skipped: true }
    } catch (error) {
      metaLog('维护.log', `snapshot error ${error instanceof Error ? error.message : String(error)}`)
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** 手动立即同步思源（面板/命令用）。 */
  const syncNow = async () => {
    const result = await runMirror()
    metaLog('维护.log', `manual sync ok=${result.ok === true}${result.error ? ` ${result.error}` : ''}`)
    return result
  }

  /** 手动立即快照。 */
  const backupNow = () => {
    const result = runBackup({ force: true })
    metaLog('维护.log', `manual backup ok=${result.ok === true}${result.error ? ` ${result.error}` : ''}`)
    return result
  }

  /** 一起跑：镜像 + 快照 + 月度体检/滚动。 */
  const runOnce = async (reason = 'tick') => {
    const started = Date.now()
    const mirror = await runMirror()
    const backup = runBackup()
    let monthly = null
    let rolling = null
    try {
      const entries = loadEntries(root).entries
      monthly = monthlyAudit(root, entries)
      rolling = rollCalendars(root, entries)
    } catch (error) {
      metaLog('维护.log', `audit/roll failed ${error instanceof Error ? error.message : String(error)}`)
    }
    metaLog('维护.log', `tick reason=${reason} mirror=${mirror.ok === true} backup=${backup.ok === true} ${Date.now() - started}ms`)
    return { mirror, backup, monthly, rolling }
  }

  service.maintenance = {
    runOnce,
    runMirror,
    runBackup,
    syncNow,
    backupNow,
    status() {
      return {
        siyuan: {
          enabled: siyuan.enabled === true,
          baseURL: siyuan.baseURL,
          notebook: siyuan.notebook,
          rootHPath: siyuan.rootHPath,
          tokenEnv: siyuan.tokenEnv,
        },
        backup: { enabled: cfg?.backup?.enabled === true, snapshotHour: cfg?.backup?.snapshotHour, keep: cfg?.backup?.keep, intervalMinutes: cfg?.backup?.intervalMinutes },
        lastMirrorAt,
        lastMirrorError,
      }
    },
  }

  // 启动 60 秒后先跑一次，随后按配置间隔轮询。
  const intervalMinutes = Math.max(1, Number(cfg?.backup?.intervalMinutes) || DEFAULT_INTERVAL_MINUTES)
  const boot = setTimeout(() => {
    void runOnce('boot')
  }, 60_000)
  const timer = setInterval(() => {
    void runOnce('tick')
  }, intervalMinutes * 60_000)
  // 后台定时器不阻止进程退出（测试/宿主关闭时友好）。
  boot.unref?.()
  timer.unref?.()
  disposers.push(() => clearTimeout(boot), () => clearInterval(timer))

  metaLog('维护.log', `maintenance installed interval=${intervalMinutes}min siyuan=${siyuan.enabled === true}`)
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* ignore */
      }
    }
  }
}
