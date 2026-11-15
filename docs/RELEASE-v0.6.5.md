# v0.6.5 — 修复夜梦关闭不生效 / 旧日程未清理

发布日期：2026-11-15

DSH `0.2.2-rc.1` 的 `schedule` API 改了：

- `create(sessionId, spec)` → `create({ title, prompt, timing, target })`
- `delete({ sessionId, id })` → `edit({ id, action: 'delete' })`
- `update(...)` → `edit({ id, action: 'update', patch })`
- `list({ sessionId })` → `list({ limit })`，结果从数组变成 `{ items }`

插件还在用旧签名，导致：

- 夜梦任务创建失败（`timing must contain exactly kind and its matching selector`）；
- 取消工作会话的夜梦后，旧日程删不掉，`梦.json` 里残留；
- 重启后面板仍显示「已排程」，夜梦日志还在 skip 这个会话。

## 修复

- 新增 schedule API 兼容层：新 API 用 `timing:{kind:'daily',daily:{...}}` + `target:{kind:'session',sessionId}`，
  删除/更新走 `edit()`；旧 API 仍保留兼容；
- `setSessionEnabled(false)` 现在会 `await` 删除，不再“先返回成功、后台慢慢删”；
- 启动时 `pruneSchedules` 会清掉状态里已关闭会话的旧日程（即使任务已不存在）；
- `ensureSchedule` 合并并发调用，避免启动登记与 pre-step 同时创建两条任务。

## 验证

- 213 项测试通过；新增 DSH 0.2.2 modern schedule API 测试与“旧日程清理”测试。
- 旧测试继续通过（兼容旧 API）。

## 升级

拉取后重启 DSH。重启时会自动清掉工作会话残留的夜梦日程，面板不再显示「已排程」。
