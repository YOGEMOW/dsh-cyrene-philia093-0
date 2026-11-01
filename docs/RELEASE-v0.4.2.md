# v0.4.2 — 漂移诊断收口

发布日期：2026-11-01

0.4.1 把 `standard` 文档不可读改成“跳过”，但 doctor 仍会显示 `未完整检测：standard`。
这次把诊断做成两层，避免无意义的告警：

- **已安装预设检查**：读取实际挂载的 `chat` / `cyrene-work`，确认关键行
  `persona`、`cyrene-runtime`、`cyrene-commands`、`cyrene-plan-bridge` 都在；
- **base 文档检查**：当前 DSH（0.2.1-rc.5）不再提供 `standard` / `cordis` 的
  `readDocument` 文档，这一层标记为跳过，不再显示 base 名和错误全文；
- doctor 最终只会显示：
  - `预设结构正常（chat/cyrene-work 关键行齐全）；base 文档跳过（DSH 版本差异）`，或
  - 真正缺行时才列出缺的预设/行。

生成物一致性仍由 `npm run check` 保证；base 快照的版本对齐留作后续独立任务。

## 验证

- 202 项测试通过；`npm run check` 生成一致。
- 已安装预设检查在 DSH rc.5 上可用；base 文档不可读时自动跳过。

## 升级

拉取后重启 DSH；无需迁移记忆。
