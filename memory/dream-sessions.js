/**
 * 夜梦会话登记：哪些昔涟会话要自动挂 23:30 的夜梦任务、各自最后一次活动。
 *
 * 默认对新会话开启（延续旧插件"所有昔涟会话都有夜梦"的行为），用户可在设置面板或
 * `/cyrene dream on|off` 里逐会话关闭。夜梦执行时只写一篇统合梦志（记忆本来就是全局的）。
 */
import { readJSON, safeRelPath, writeJSON } from './store.js'

const FILE_REL = '元/梦会话.json'
const MAX_TEXT = 240

const empty = () => ({ version: 1, defaultEnabled: true, sessions: {} })

/** 读登记；坏文件回落默认（fail-open）。 */
export function loadDreamSessions(root) {
  const file = safeRelPath(root, FILE_REL)
  if (file === null) return empty()
  const data = readJSON(file, null)
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return empty()
  return {
    version: 1,
    defaultEnabled: data.defaultEnabled !== false,
    sessions: data.sessions !== null && typeof data.sessions === 'object' && !Array.isArray(data.sessions)
      ? data.sessions
      : {},
  }
}

/** 写登记。 */
export function saveDreamSessions(root, state) {
  const file = safeRelPath(root, FILE_REL)
  if (file === null) return false
  return writeJSON(file, state)
}

/** 该会话是否启用夜梦（未登记按 defaultEnabled）。 */
export function isDreamEnabled(state, sessionId) {
  const entry = state?.sessions?.[String(sessionId ?? '')]
  if (entry === undefined) return state?.defaultEnabled !== false
  return entry.enabled !== false
}

/** 记一次会话活动；如果还没登记就按默认值建一条。 */
export function touchDreamSession(root, sessionId, patch = {}) {
  const sid = String(sessionId ?? '')
  if (sid === '') return null
  const state = loadDreamSessions(root)
  const prev = state.sessions[sid] ?? { enabled: state.defaultEnabled !== false, createdAt: Date.now() }
  state.sessions[sid] = {
    ...prev,
    lastActiveAt: Date.now(),
    ...(typeof patch.preset === 'string' ? { preset: patch.preset } : {}),
    ...(typeof patch.title === 'string' && patch.title.trim() !== '' ? { title: patch.title.trim().slice(0, 120) } : {}),
    ...(typeof patch.cwd === 'string' && patch.cwd.trim() !== '' ? { cwd: patch.cwd.trim() } : {}),
    ...(typeof patch.lastUserText === 'string' && patch.lastUserText.trim() !== ''
      ? { lastUserText: patch.lastUserText.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) }
      : {}),
  }
  saveDreamSessions(root, state)
  return state.sessions[sid]
}

/** 开启/关闭某个会话的夜梦。 */
export function setDreamEnabled(root, sessionId, enabled) {
  const sid = String(sessionId ?? '')
  if (sid === '') return null
  const state = loadDreamSessions(root)
  const prev = state.sessions[sid] ?? { createdAt: Date.now() }
  state.sessions[sid] = { ...prev, enabled: enabled === true, updatedAt: Date.now() }
  saveDreamSessions(root, state)
  return state.sessions[sid]
}

/** 已启用夜梦的会话（可能包含已离线会话）。 */
export function enabledSessionIds(state) {
  const ids = []
  for (const [sid, entry] of Object.entries(state?.sessions ?? {})) {
    if (entry?.enabled !== false) ids.push(sid)
  }
  return ids
}

/** 清理长期不在的登记（默认保留 90 天内的活动记录）。 */
export function pruneDreamSessions(root, keepIds, now = Date.now()) {
  const state = loadDreamSessions(root)
  const keep = new Set((keepIds ?? []).map(String))
  let changed = false
  for (const [sid, entry] of Object.entries(state.sessions)) {
    const idle = now - Number(entry?.lastActiveAt ?? entry?.createdAt ?? 0)
    if (!keep.has(sid) && idle > 90 * 86400000) {
      delete state.sessions[sid]
      changed = true
    }
  }
  if (changed) saveDreamSessions(root, state)
  return state
}
