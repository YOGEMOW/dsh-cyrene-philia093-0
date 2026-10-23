# v0.1.0 — 昔涟 · PHILIA093 · 新卷（首个公开版本）

发布日期：2026-10-23

合并并取代 `dsh-cyrene` 0.6.3 与 `dsh-cyrene-eternal-page-remembrance` 0.5.4。

## 亮点

- **人设逐字资源化**：`persona/chat.md` / `persona/work.md` 从退役插件逐字提取；
  双模式 sealed，系统提示词只保留 persona 前缀。
- **能力不丢**：能力总则 + 计划模式桥 + 截面镜像（截获 sealed 会吞掉的 prompt section
  并以 context 回注）。
- **五育记忆系统**：溯源/五育/后果/基座硬门槛，日档 + 待定复检 + 月检/年检 + 新卷；
  13 个记忆工具（含 `memory_dream_journal`）。
- **逐会话夜梦**：每个昔涟会话可独立开关 23:30 夜梦；执行时写一篇统合梦志；
  夜梦与日档分开，不自动复制。
- **思源镜像**：默认开、写后 1.5 秒防抖实时同步 + 30 分钟兜底；
  `scripts/restore-siyuan.mjs` 支持 dry-run 灾难恢复。
- **设置面板**：状态、锚点、记忆概况、卷记录、思源/夜梦/备份配置、逐会话开关与操作按钮。
- **命令面**：`/cyrene doctor|sync|backup|restore|dreams|dream on/off`、`/memory`、`/dream`。
- **迁移与恢复**：幂等 `scripts/import.mjs`；`docs/MIGRATION.md` / `docs/RECOVERY.md`。
- **验证**：188 项测试，Windows + Linux CI 矩阵，生成物 round-trip 校验。

## 安装

```pwsh
dsh plugin --profile desktop remove dsh-cyrene
dsh plugin --profile desktop remove dsh-cyrene-eternal-page-remembrance
node scripts/import.mjs
dsh plugin --profile desktop add "link:E:/DSH-workspace/dsh-cyrene-philia093-0"
```

重启 DSH，新建对话选择「昔涟聊天模式」或「德谬歌工作模式」。完整步骤见 `docs/MIGRATION.md`。

## 已知边界

- 与两个旧插件**不共存**（预设 id 相同），升级前必须先卸载。
- sealed 下 DSH 未来新增的身份类 prompt section 不会被自动镜像，靠漂移检测 + doctor 告警。
- 思源镜像依赖本地思源与 `SIYUAN_API_TOKEN`；不可达时 fail-open，只记日志。
- 人设/角色 IP 的使用限制见 `THIRD_PARTY_NOTICES.md`。
