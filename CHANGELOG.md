# Changelog

## [0.1.0] — 2026-10-22

首卷（卷 0）实现完成。合并并取代：

- `dsh-cyrene` 0.6.3（人设语料、世界书、称呼/风格/形态/场景、预设声明）
- `dsh-cyrene-eternal-page-remembrance` 0.5.4（记忆引擎）

### 合并后的结构

- **人设是数据**：`persona/{chat,work}.md` 逐字提取自退役插件；`philosophy/wuyu.md` 为五育 canonical。
- **能力是生成物**：`scripts/build.mjs` 从 `modes/` + 内置快照（standard/cordis，0.2.1-rc.2）合成
  `cordis.patch.yml`；不允许手抄能力行。
- **双模式 sealed**：系统提示词只有 persona 前缀；能力通过工具、`variable`、`context`、
  `pre-step` 四条通道恢复，并补「能力总则」（order 150）与「计划模式桥」（planning 组内，order 155）。
- **四条上下文轨道**：称呼 120 / 形态 125 / 风格 130 / 世界书 140；聊天模式全开，工作模式只留世界书。
- **五育发展系统**：写入硬门槛（溯源 / 五育归属 / 决策后果 / 基座只读）→ 日档或 `余页/待定/`；
  待定复检/提升；月检（五育体检写年轮）+ 年检；新卷（人格快照 + sha256 指纹，只增不改）。
- **记忆工具**：`memory_write/search/read/recall/update/forget/link/anchor/fs/pending/promote`
  + `remember/forget`；preset 作用域，标准模式不可见。
- **夜梦与维护默认开**：23:30 六阶段整理；30 分钟维护 tick（思源镜像、每日快照、月度体检、月年滚动）；
  全部 fail-open。
- **截面镜像（sealed 语义兜底）**：监听 `system-prompt/assemble`（在 complete 恢复之前拿到全量 section），
  把会被 sealed 吞掉的 `tool:*` / `plan:*` / 未知段以 context 原样回注；`deployment:*` 与人设正文永不镜像；
  清单写进 `service.diagnostics.sections`，`/cyrene doctor` 展示。
- **治理**：`/cyrene doctor`、`/memory`、`/dream`（独立 `cyrene-commands` 行）；`host/drift.mjs` 用
  `agentPresets.readDocument` 对比快照；`scripts/import.mjs` 幂等迁移（旧 `.md` + 一页永恒目录）。

### 实机反馈修复（2026-10-22）

- 命令改为独立 `cyrene-commands` 预设行，修复 `/cyrene doctor` 被当成普通消息的问题；注册过程写
  `元/命令诊断.log`。
- 迁移/首次启动补卷 0 的 `persona_hash`（`memory/persona.js`）。
- 启动时清理迁移带进来的死会话夜梦日程；`schedule.update` 返回未更新时删除重建，不再静默。
- 迁移报告展示当前日档/记忆总量，并注明“0 新增是幂等重跑，不是迁移失败”。
- 新增设置面板（Client 半）：昔涟 · 一页永恒——状态 + 立即同步思源/立即备份/立即整理 +
  思源/定时配置；配置写入 `元/settings.json`，与行配置在启动时合并。新增 `/cyrene sync`、
  `/cyrene backup` 命令。
- 截面镜像监听改挂到 agent 作用域（preset 作用域在实机收不到装配事件）。
- 灾难恢复：`scripts/restore-siyuan.mjs`（`--dry-run` / `--force --yes`）、`/cyrene restore`、
  面板「从思源恢复」；恢复条目/锚点/梦志（missing-only，hash 去重）。手册见 `docs/RECOVERY.md`。
- 设置面板排版重做：状态徽标、工具条、两列卡片（锚点/概况、思源/定时），统一主题变量与控件尺寸。
- 面板第二轮：四问锚点改为分块；「我是谁」里的「卷·」记录拆到独立的「卷记录」卡片（含当前卷/指纹/历史）；
  思源与夜梦卡片只保留一行状态摘要，去掉和表单重复的地址/笔记本/时间行。
- 夜梦修复：启动时只保留活着的昔涟会话那一条日程（按会话创建时间取最新）；只有"当前会话"的标记能触发
  （旧会话标记一律丢弃）；手动触发会自己挑最新活会话并写日志。
- 补记：模型没写梦志时，按当天日档生成「补记」（时间 · 五育 · 正文），不再只留一句道歉；
  新增 `/cyrene note`、面板「补记梦志」、`scripts/repair-journals.mjs`（默认预览，`--apply` 写入）。
  已为 2026-10-22 的空白夜梦补上当天 3 条记忆。

### 验证

- 单元/契约/迁移测试全绿（Windows + Linux CI 矩阵）。
- 生成物 PyYAML 校验 + 声明对象/YAML round-trip 一致。
- 迁移演练（合成数据）：首次导入 3 条、重跑 0 条新增、源数据不动。

### 已知限制

- **未在真机 profile 安装验证**：安装前必须先卸两个旧插件（preset id `chat`/`cyrene-work` 冲突）。
- sealed 下操作类 prompt section 由截面镜像回注；身份/人设类段默认跳过，靠 doctor 告警人工判断。
- 思源镜像依赖本地思源与 `SIYUAN_API_TOKEN`；失败只记日志。
