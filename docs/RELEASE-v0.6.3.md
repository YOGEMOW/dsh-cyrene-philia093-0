# v0.6.3 — 适配 DSH 0.2.2-rc.1 移除了 list-agents 子路径

发布日期：2026-11-06

DSH `0.2.2-rc.1` 移除了：

- `@deepseek-ai/dsh-tool-subagent-control/list-agents` 子路径导出；
- `cordis.plugins.json` / `standard.plugins.json` 里的 `list-agents` 项。

本插件内置的 base 快照仍保留这一行，导致加载时找不到该子路径，插件加载失败。

## 修复

- 从 `modes/base/cordis.plugins.json` 和 `modes/base/standard.plugins.json` 删除
  `tool-subagent-list-agents` 行；
- 重新生成 `cordis.patch.yml`，两个预设声明里不再包含该行；
- 保留 `@deepseek-ai/dsh-tool-subagent-control` 与 `@deepseek-ai/dsh-tool-subagent` 本身；
- 新增构建回归测试：base 快照不得再引用已移除的 `list-agents`；
- 漂移测试的预期 id 数随快照从 32 调整为 31。

## 验证

- 210 项测试通过；
- `npm run harness:check`、`npm run check` 通过；
- 生成的 `cordis.patch.yml` 中 `list-agents` 计数为 0。

## 升级

拉取后重启 DSH。DSH `0.2.2-rc.1` 会自动重新加载插件补丁。
