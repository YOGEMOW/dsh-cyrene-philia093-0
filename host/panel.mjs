/**
 * 设置面板宿主半：状态 + 立即同步 / 立即备份 / 立即整理 / 保存设置。
 *
 * 与退役的一页永恒面板同构（Client 半在 client.js）：
 *   GET  {prefix}/status                 → 面板数据
 *   GET  {prefix}/session?sessionId=…    → 会话头徽标数据（preset / 夜梦状态）
 *   POST {prefix}/action {action, config} → sync | backup | dream | save-config
 *
 * 配置写入 `<root>/元/settings.json`；行配置仍是出厂层，两者在启动时合并。
 * 面板保存后提示重启（配置在 apply 时解析，热改不重装轨道）。
 */
import { readAnchors } from '../memory/anchor.js'
import { loadEntries } from '../memory/entries.js'
import { pendingCount } from '../memory/pending.mjs'
import { readSettings, writeSettings } from '../memory/settings.js'
import { quotaUsage } from '../memory/store.js'

export const PANEL_PREFIX = '/dsh-cyrene-philia093-0'

const readJsonBody = (req) => new Promise((resolve) => {
  let raw = ''
  req.on('data', (chunk) => {
    raw += chunk
    if (raw.length > 256 * 1024) req.destroy()
  })
  req.on('end', () => {
    try {
      resolve(raw.trim() === '' ? {} : JSON.parse(raw))
    } catch {
      resolve({})
    }
  })
  req.on('error', () => resolve({}))
})

const send = (res, code, body) => {
  try {
    res.statusCode = code
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(body))
  } catch {
    /* ignore */
  }
}

function humanMB(bytes) {
  return Math.round(((Number(bytes) || 0) / 1024 / 1024) * 100) / 100
}

/** 面板状态数据。 */
export function buildPanelStatus({ service, agents } = {}) {
  const root = service?.root ?? ''
  const config = service?.config ?? {}
  let entries = []
  try {
    entries = loadEntries(root).entries
  } catch {
    entries = []
  }
  let anchors = {}
  try {
    anchors = readAnchors(root)
  } catch {
    anchors = {}
  }
  let quota = {}
  try {
    quota = quotaUsage(root) ?? {}
  } catch {
    quota = {}
  }
  const maintenance = service?.maintenance?.status?.() ?? {}
  const dream = service?.dream?.status?.() ?? {}
  const siyuan = config.siyuan ?? {}
  return {
    root,
    entries: {
      total: entries.length,
      active: entries.filter((entry) => entry?.status !== 'archived').length,
      archived: entries.filter((entry) => entry?.status === 'archived').length,
      pending: pendingCount(root),
      axes: entries.reduce((acc, entry) => {
        if (entry?.axis !== undefined) acc[entry.axis] = (acc[entry.axis] ?? 0) + 1
        return acc
      }, {}),
    },
    anchors: {
      self: anchors.self?.content ?? '',
      user: anchors.user?.content ?? '',
      origin: anchors.origin?.content ?? '',
      goal: anchors.goal?.content ?? '',
      version: anchors.self?.meta?.version ?? '',
      updatedAt: anchors.self?.meta?.updatedAt ?? '',
    },
    quota: {
      usedMB: humanMB(quota.bytes),
      limitMB: config.quotaMB ?? 0,
      freeUsedMB: humanMB(quota.byTop?.['余页']),
      freeLimitMB: config.freeQuotaMB ?? 0,
    },
    mirror: {
      enabled: siyuan.enabled === true,
      baseURL: siyuan.baseURL ?? '',
      notebook: siyuan.notebook ?? '',
      rootHPath: siyuan.rootHPath ?? '',
      tokenEnv: siyuan.tokenEnv ?? '',
      lastSync: maintenance.lastMirrorAt ? new Date(maintenance.lastMirrorAt).toLocaleString() : '',
      lastError: maintenance.lastMirrorError ?? '',
    },
    dream: {
      ...dream,
      lastDreamAtLabel: dream.lastDreamAt ? new Date(dream.lastDreamAt).toLocaleString() : '',
    },
    backup: maintenance.backup ?? {},
    config: {
      siyuan: {
        enabled: siyuan.enabled === true,
        baseURL: siyuan.baseURL ?? '',
        notebook: siyuan.notebook ?? '',
        rootHPath: siyuan.rootHPath ?? '',
        tokenEnv: siyuan.tokenEnv ?? '',
      },
      backup: {
        enabled: config.backup?.enabled === true,
        intervalMinutes: config.backup?.intervalMinutes ?? 30,
        snapshotHour: config.backup?.snapshotHour ?? 3,
        keep: config.backup?.keep ?? 7,
      },
      dream: {
        enabled: config.dream?.enabled === true,
        time: config.dream?.time ?? '23:30:00',
        timeZone: config.dream?.timeZone ?? 'Asia/Shanghai',
      },
    },
    settingsOverride: Object.keys(readSettings(root)).length > 0,
    agents: typeof agents === 'number' ? agents : undefined,
  }
}

/** 找到最近的昔涟活会话（夜梦手动触发用）。 */
function findAgent(ctx, service) {
  try {
    const agents = ctx.get('agents')
    if (agents === null || typeof agents !== 'object') return undefined
    const sessionId = service?.dream?.status?.().lastSessionId
    if (typeof sessionId !== 'string' || sessionId === '') return undefined
    if (typeof agents.get === 'function') return agents.get(sessionId)
  } catch {
    /* ignore */
  }
  return undefined
}

/** 面板 HTTP handler（绑定到 {prefix}）。 */
export function createPanelHandler({ ctx, service, pluginVersion = '0.0.0' }) {
  return async (req, res) => {
    try {
      const url = new URL(String(req.url ?? '/'), 'http://127.0.0.1')
      if (url.pathname === `${PANEL_PREFIX}/status` && req.method === 'GET') {
        return send(res, 200, buildPanelStatus({ service }))
      }
      if (url.pathname === `${PANEL_PREFIX}/session` && req.method === 'GET') {
        const sessionId = String(url.searchParams.get('sessionId') ?? '')
        let preset = ''
        try {
          const agent = ctx.get('agents')?.get?.(sessionId)
          const registry = ctx.get('agentPresets')
          if (agent !== undefined && registry !== null && typeof registry?.composedPreset === 'function') {
            preset = registry.composedPreset(agent.ctx) ?? ''
          }
        } catch {
          preset = ''
        }
        const dream = service?.dream?.status?.() ?? {}
        return send(res, 200, {
          preset,
          version: pluginVersion,
          dreamedToday: dream.dreamedToday === true,
          running: dream.running === true,
          lastDreamAt: dream.lastDreamAt ? new Date(dream.lastDreamAt).toLocaleString() : '',
        })
      }
      if (url.pathname === `${PANEL_PREFIX}/action` && req.method === 'POST') {
        const body = await readJsonBody(req)
        const action = String(body?.action ?? '')
        if (action === 'sync') {
          const result = await service?.maintenance?.syncNow?.()
          if (result === undefined) return send(res, 400, { ok: false, error: '维护未安装' })
          return send(res, 200, result.ok === true
            ? { ok: true, message: `已同步到思源（条目 ${result.entries ?? 0}）。` }
            : { ok: false, error: result.error ?? '同步失败' })
        }
        if (action === 'backup') {
          const result = service?.maintenance?.backupNow?.()
          if (result === undefined) return send(res, 400, { ok: false, error: '维护未安装' })
          return send(res, 200, result.ok === true
            ? { ok: true, message: `已备份：${result.path ?? ''}${result.skipped ? '（已存在，跳过）' : ''}` }
            : { ok: false, error: result.error ?? '备份失败' })
        }
        if (action === 'dream') {
          const trigger = service?.dream?.triggerDream
          if (typeof trigger !== 'function') return send(res, 400, { ok: false, error: '夜梦未安装' })
          const result = await trigger(findAgent(ctx, service))
          return send(res, 200, result.ok === true
            ? { ok: true, message: result.message ?? '已启动整理。' }
            : { ok: false, error: result.error ?? '启动失败' })
        }
        if (action === 'save-config') {
          const result = writeSettings(service.root, body?.config)
          if (result.ok !== true) return send(res, 400, { ok: false, error: result.error ?? '保存失败' })
          return send(res, 200, { ok: true, message: '已保存到 元/settings.json；重启 DSH 后生效。', settings: result.settings })
        }
        return send(res, 400, { ok: false, error: `未知 action：${action}` })
      }
      return send(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      return send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/**
 * 注册面板路由。
 * @returns disposer
 */
export function installPanel(ctx, service, pluginVersion = '0.0.0') {
  let dispose = null
  try {
    ctx.inject(['webServer'], (scope) => {
      const server = scope.webServer
      if (server === null || typeof server !== 'object' || typeof server.register !== 'function') return
      dispose = scope.effect(
        () => server.register({ kind: 'prefix', path: PANEL_PREFIX, handler: createPanelHandler({ ctx: scope, service, pluginVersion }) }),
        'cyrene panel route',
      )
      ctx?.logger?.info?.(`[cyrene-panel] 已注册 ${PANEL_PREFIX} 状态/操作路由`)
    })
  } catch (error) {
    ctx?.logger?.warn?.(`[cyrene-panel] 路由安装失败（已跳过）：${error instanceof Error ? error.message : String(error)}`)
  }
  return () => {
    try {
      dispose?.()
    } catch {
      /* ignore */
    }
  }
}
