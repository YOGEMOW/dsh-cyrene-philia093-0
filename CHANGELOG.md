# Changelog

## [0.4.3] — 2026-11-01

- 修复思源日档缺失：空日现在也会建文档（`syncDayShells`）；清理迁移后误挂到
  `/余页/10/...` 的日档副本并重置镜像状态重建。10 月 14 天已齐全。
- 测试：202 项。

## [0.4.2] — 2026-11-01

- doctor 漂移诊断收口：新增已安装预设检查（chat/cyrene-work 关键行）；base 文档不可读时跳过，
  不再显示 `未完整检测：standard` 或整页缺失列表。
- 测试：202 项。

## [0.4.1] — 2026-11-01

- 修复 Linux CI：`safeRelPath` 在 POSIX 上统一把 `/` 与 `\\` 当分隔符，同时继续拒绝 Windows 盘符路径。
- doctor 漂移：base 文档不可读时标记 `skipped`，不再把快照全部行误报为缺失。
- 测试：202 项。

## [0.4.0] — 2026-11-01

- 存储布局升级：日档/月响/年轮归入「岁月涟漪」；梦→梦境并按 `YYYY/MM/` 分级；
  提供 `scripts/migrate-layout.mjs`（dry-run/apply、幂等、改写 path）。
- 最后一天自动整理：月末 23:50 后生成 `status: final` 月响，年末 23:50 后追加年轮定格；
  10 月已补录。
- 四级整理/召回：日档→夜梦→月响→年轮；首轮快照按此顺序注入；月响/年轮带
  `thread/source_days/source_dreams` 与「来源（链式召回）」。
- 思源：逐级创建父文档并重试，修复 `document metadata is not ready`；新增岁月涟漪/梦境路径。
- 看门狗：维护 tick 巡检目录/旧路径/月响年轮文件并自动补骨架。
- 测试：202 项。

## [0.3.1] — 2026-11-01

- 思源同步月档与年档：新增 `/一页永恒/月/YYYY/YYYY-MM · 月档`、
  `/一页永恒/年/YYYY · 年轮`；自动/手动同步都会带上，hash 未变跳过。
- 测试：199 项。

## [0.3.0] — 2026-11-01

- 月档/年档自动创建：启动/维护补当前月骨架，月末替换为正式月档，跨年自动定格年轮；
  新增 `/cyrene 月档` 立即整理。
- 夜梦读取启用会话当天的真实对话摘录（≤12000 字）作为素材，补救白天没写入日档的对话；
  夜梦不再尝试用 `memory_fs` 写月/年。
- 测试：198 项。

## [0.2.4] — 2026-10-29

- 夜梦会话列表以 DSH 会话清单为准：已删除的旧会话（如 `session-944fe39a…`）不再显示。
- 短会话 id 去掉 `session-` 前缀，显示 UUID 前 8 位；无标题会话显示「未命名会话（短 id）」。
- 列表提示改为「点一行打开会话；勾选框只开关夜梦」。测试：194 项。

## [0.2.3] — 2026-10-26

- 设置面板「夜梦与定时」会话列表可辨认：显示会话标题、工作区名、短 id、最近活动时间；
  点一行可直接打开该会话（勾选框只开关夜梦，不触发跳转）。
- 列表补上其他昔涟会话（未登记）供勾选；标题读取失败时退回最近一句。
- 测试：194 项。

## [0.2.2] — 2026-10-26

- 新增 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)：装完 DSH 起不来、想卸干净时的完整退路。
  含：记忆不在插件目录（卸载不删记忆）、正常卸载、卸不掉时手动清理 `link:` 条目、
  `dsh.profile.bundles` 残留需同删、换 profile 兜底、数据位置对照表、求助时该贴的信息。
- README 补两处指向该文档的索引；安装小节末尾一句直达。
- 无记忆格式、人设、命令变更；升级无需迁移。
- 测试：193 项。

## [0.2.1] — 2026-10-25

- `/cyrene` 支持中文子命令与中文帮助（帮助/诊断/同步/备份/恢复/夜梦/开启夜梦/关闭夜梦/开卷），
  英文写法继续可用；输入提示改为中文短句；无法识别时显示中文帮助。
- 测试：193 项。

## [0.2.0] — 2026-10-23

- 新增开新卷入口：`scripts/new-volume.mjs`（`--dry-run` / `--confirm new-volume`）与
  `/cyrene new-volume confirm <原因>`；开卷记录卷号/指纹并快照旧 persona，不改写人设文本。
- README 改为昔涟口吻的通俗介绍，并补「什么时候该开新卷」的判断标准、问题清单与例子；
  新增 [docs/TECHNICAL.md](docs/TECHNICAL.md)（给 AI/开发者的技术地图与不变量）。
- 修正旧插件仓库链接；版本与发布说明同步。
- 测试：192 项。

## [0.1.0] — 2026-10-23

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
- 夜梦会话登记（取代"只留最新会话"）：所有昔涟会话默认登记为启用，各自挂 23:30 任务；
  设置面板逐会话勾选、`/cyrene dream on|off` 切换当前会话、`/cyrene dreams` 列清单；
  执行时只写一篇统合梦志（各会话共享记忆，提示词里带参与会话与最近一句摘要）。
  `dream.maxScheduledSessions` 默认提到 8。补回 `memory_dream_journal` 工具（此前提示词要求写梦志但没有该工具）。
- 纠正（2026-10-23）：夜梦不再自动复制日档内容——这是功能混淆，已撤销 `/cyrene note`、
  「补记梦志」按钮与 `scripts/repair-journals.mjs`。夜梦只记录模型六阶段产出（`memory_dream_journal`）；
  模型没写时只留「本次夜梦没有产出」说明，日档与梦志分开。2026-10-22 那份复制内容待清理。
- 面板会话列表不再空：`agent/created` 即登记；列表同时包含活会话、登记表、旧日程与 `lastSessionId`
  的离线项（可逐项勾选开关）。
- 思源写后实时同步：`tool/result` / `turn/end` 触发 1.5s 防抖 `flushSoon`，条目/锚点/梦志/余页
  写完就会同步；30 分钟 tick 只作兜底。

### 验证

- 单元/契约/迁移测试全绿（Windows + Linux CI 矩阵）。
- 生成物 PyYAML 校验 + 声明对象/YAML round-trip 一致。
- 迁移演练（合成数据）：首次导入 3 条、重跑 0 条新增、源数据不动。

### 已知限制

- **未在真机 profile 安装验证**：安装前必须先卸两个旧插件（preset id `chat`/`cyrene-work` 冲突）。
- sealed 下操作类 prompt section 由截面镜像回注；身份/人设类段默认跳过，靠 doctor 告警人工判断。
- 思源镜像依赖本地思源与 `SIYUAN_API_TOKEN`；失败只记日志。

