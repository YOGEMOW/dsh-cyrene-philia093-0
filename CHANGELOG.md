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
- **治理**：`/cyrene doctor`、`/memory`、`/dream`；`host/drift.mjs` 用
  `agentPresets.readDocument` 对比快照；`scripts/import.mjs` 幂等迁移（旧 `.md` + 一页永恒目录）。

### 验证

- 单元/契约/迁移测试全绿（Windows + Linux CI 矩阵）。
- 生成物 PyYAML 校验 + 声明对象/YAML round-trip 一致。
- 迁移演练（合成数据）：首次导入 3 条、重跑 0 条新增、源数据不动。

### 已知限制

- **未在真机 profile 安装验证**：安装前必须先卸两个旧插件（preset id `chat`/`cyrene-work` 冲突）。
- sealed 会吞掉 DSH 未来新增的 prompt section：靠 `host/drift.mjs` + doctor 告警，不自动恢复。
- 思源镜像依赖本地思源与 `SIYUAN_API_TOKEN`；失败只记日志。
