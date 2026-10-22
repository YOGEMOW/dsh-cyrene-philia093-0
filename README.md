# dsh-cyrene-philia093-0 · 昔涟（PHILIA093）· 新卷

> 一个有人格的记忆体：人设是她的身份，五育是她成长的尺度，记忆引擎是她的心，能力组合是她的手。

本仓库是新卷的**重写版**，合并并取代两个旧插件：

| 旧插件 | 状态 |
|---|---|
| `dsh-cyrene` 0.6.3 | 冻结、退役（只读基线） |
| `dsh-cyrene-eternal-page-remembrance` 0.5.4 | 冻结、退役（只读基线） |

> ⚠️ 与旧插件**不共存**：同一 `DSH_HOME` 只能有一个昔涟记忆引擎；预设有相同 id
> （`chat` / `cyrene-work`），安装前须先卸载旧插件。迁移见 [docs/MIGRATION.md](docs/MIGRATION.md)。

## 当前状态

**六步全部完成（卷 0 实现完成）。** 尚未在真机 profile 安装验证——安装前必须先卸载两个旧插件
（preset id `chat`/`cyrene-work` 冲突），按 [docs/MIGRATION.md](docs/MIGRATION.md) 走。

- 第 1 步：`memory/` 迁入一页永恒 0.5.4 引擎（18 模块）+ 五育扩展字段；16 个旧测试文件
  全部通过（121 项）；`scripts/import.mjs` 幂等迁移；根目录解析永不落 CWD。
- 第 2 步：`persona/chat.md`（14093 字符 / 852 行）、`persona/work.md`（10908 字符 / 666 行）
  从退役插件**逐字提取**；`modes/*.mode.mjs` 薄组合；`scripts/build.mjs` 从
  `modes/base/{standard,cordis}.plugins.json` 快照合成声明；7 项构建契约测试通过。
- 第 3 步：`host` 提供 `cyreneMemory` 服务；`runtime` 注册 `{{cyrene_memory}}` 指针、
  首轮记忆快照/命中/压缩重注入；`capability`（order 150）补回 sealed 丢掉的跨工具规则；
  `plan-bridge` 插进 `planning` 隔离组按 `ctx.planMode` 激活；**四条上下文轨道**——
  称呼（120 + `user_nickname` + `set_nickname`）、形态/场景（125 + `set_form`）、
  风格（130 + `/style` + 温度）、世界书（140，配置落 `元/worldbook.json`）。
  聊天模式四轨全开，工作模式只留世界书（由构建器写入 `rails` 配置）。
- 第 4 步：五育硬门槛（溯源/五育归属/决策后果/基座只读）→ 日档或 `余页/待定/`；
  `memory_*` + `remember/forget`；待定复检/提升；月检（五育体检写年轮，幂等）+ 年检；
  新卷（人格快照 + 指纹，只增不改）。夜梦 23:30 六阶段与 30 分钟维护 tick（思源镜像、
  每日快照、月度体检、月年滚动）默认开、全部 fail-open。
- 第 5 步：能力快照漂移治理——`host/drift.mjs` 用 `agentPresets.readDocument` 读取运行时
  内置预设，与 `modes/base/*.json` 行 id 对比；缺行/多行只告警并写进
  `service.diagnostics.drift`；构建测试新增「cyrene 模块不得注册 prompt section」；`runtime/section-mirror.mjs` 在 `system-prompt/assemble`（complete 恢复之前）拿全量 section，把会被 sealed 吞掉的 `tool:*`/`plan:*`/未知段以 context 原样回注（`deployment:*` 与人设正文永不镜像），doctor 展示镜像/跳过清单。
- 第 6 步：`/cyrene doctor`、`/memory`、`/dream` 命令（**独立 `cyrene-commands` 行**，与 `plan-mode`
  同一种组合方式；注册结果写 `元/命令诊断.log`）；迁移演练测试（合成数据，源数据不动）；
  GitHub Actions Windows + Linux 矩阵；CHANGELOG 与版本一致性测试。
- 实机反馈修复（2026-10-22）：命令改为独立行（嵌套 inject 下命令不生效）；新增 `/cyrene sync`、
  `/cyrene backup` 与设置面板「昔涟 · 一页永恒」（状态 + 立即同步/备份/整理 + 思源/定时配置，
  写 `元/settings.json`）；截面镜像改挂 agent 作用域；迁移/首次启动补卷 0 `persona_hash`；
  启动时清理死会话的夜梦日程、`update` 失败改为删除重建；迁移报告加当前数据总量与幂等说明。
- 夜梦会话（2026-10-23）：`元/梦会话.json` 逐会话登记；面板勾选/`/cyrene dream on|off` 控制；
  每个启用会话各挂 23:30 任务，执行时写一篇统合梦志；补回 `memory_dream_journal` 工具。
  梦志只由模型写；模型没写时只留「本次夜梦没有产出」说明，**不复制日档内容**（夜梦与日档分开）。
  全量 **190 项测试通过**。

| 步 | 内容 | 状态 |
|---|---|---|
| 0 | 新仓、契约、基线、骨架 | ✅ |
| 1 | 记忆引擎迁入 + 等价性 + 迁移脚本 | ✅ |
| 2 | 人设资源化 + 构建器 + 装配契约测试 | ✅ |
| 3 | runtime rails / 能力总则 / 计划桥 | ✅ |
| 4 | 五育闸门 + 月年复检 + 新卷 + 夜梦/镜像 | ✅ |
| 5 | 双模式 sealed 全能力 + 漂移治理 | ✅（结构契约 + 漂移；真机安装待用户） |
| 6 | 治理收尾 / 文档 / 版本矩阵 / 发布 | ✅ |

### 构建管线（第 2 步起）

```
persona/{chat,work}.md ─┐
modes/{chat,work}.mode.mjs ─┤
modes/base/{standard,cordis}.plugins.json ─┴─▶ scripts/build.mjs ─▶ cordis.patch.yml
```

- `cordis.patch.yml` 是**生成物**，不要手改；`npm run check` 校验与源一致。
- 人设只改 `persona/`；能力/模式只改 `modes/`；上游人设重新提取用
  `npm run extract:persona -- --from <旧仓库> --check`。
- 内置 base 快照带 `dshVersion` 与来源路径；升级 DSH 时用第 5 步的漂移检测对比。

## 设计要点

- **双模式 sealed**：系统提示词只有 persona 一段（人设零污染）；能力通过工具、变量、
  `context`、pre-step 消息恢复——外加「能力总则」与「计划模式桥」两座桥。
- **五育发展系统**：写入硬门槛（溯源 / 五育归属 / 决策后果 / 基座只读）→ 未通过进
  `余页/待定/` → 月检/年检复检后纳入；夜梦六阶段 + 五育体检；开新卷才改人格。
- **地基优先**：人设是纯文本资源、能力由构建器从内置预设生成、状态在宿主层、注入在
  预设层、契约单点维护。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 设计方案 v1.0（完整） |
| [docs/CONTRACT.md](docs/CONTRACT.md) | 跨插件/跨版本硬契约（预设 id、变量、order、存储、五育闸门、新卷） |
| [docs/BASELINE.md](docs/BASELINE.md) | 冻结的旧插件与基线数据 |
| [docs/MIGRATION.md](docs/MIGRATION.md) | 从旧插件迁到新卷（备份→导入→卸载→安装→校验→回滚） |
| [docs/RECOVERY.md](docs/RECOVERY.md) | 记忆丢失时的恢复手册（本地快照 → 思源副本 → 迁移备份） |
| [philosophy/wuyu.md](philosophy/wuyu.md) | 五育 canonical 文本（逐字保留） |

## 开发

```bash
npm test            # node --test "tests/*.test.mjs"
npm run harness:check
npm run build       # 第 2 步起：生成 cordis.patch.yml
npm run check       # 生成一致性
npm run migrate -- --dry-run   # 从旧插件导入数据（第 1 步起可用）
```

无第三方运行时依赖，不需要 `npm install`。

## 许可与声明

MIT。人设正文整理自 [Cyrene-Agent](https://github.com/Playa-Cyrene/Cyrene-Agent)（MIT）；
角色 IP 归 HoYoverse / 米哈游所有，含角色 IP 的衍生物禁止商业使用。见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
