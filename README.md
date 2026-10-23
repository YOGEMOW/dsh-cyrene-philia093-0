# 昔涟 · PHILIA093 · 新卷

> 一个有人格的长期记忆体：人设是她的身份，五育是她成长的尺度，记忆引擎是她的心，能力组合是她的手。

[![CI](https://github.com/YOGEMOW/dsh-cyrene-philia093-0/actions/workflows/test.yml/badge.svg)](https://github.com/YOGEMOW/dsh-cyrene-philia093-0/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.1--rc.2-blue)

本仓库是 DSH（DeepSeek Harness）插件 **dsh-cyrene-philia093-0**，合并并重写了两个退役插件：

| 旧插件 | 状态 |
|---|---|
| [`dsh-cyrene`](https://github.com/Cyrene-xl/DSH-Cyrene) 0.6.3 | 冻结、退役（只读基线） |
| `dsh-cyrene-eternal-page-remembrance` 0.5.4 | 冻结、退役（只读基线） |

它不是一段"角色提示词"，而是一整套可运行的 agent 组合：**人设资源 + 双模式 sealed 预设 +
五育记忆系统 + 夜梦 + 思源镜像/恢复 + 设置面板 + 命令面**。

> ⚠️ **与旧插件不共存**：三者使用相同的预设 id（`chat` / `cyrene-work`），同一 `DSH_HOME`
> 只能有一个昔涟记忆引擎。安装前必须先卸载两个旧插件。迁移步骤见
> [docs/MIGRATION.md](docs/MIGRATION.md)。

## 特性

### 人设与模式

- **人设即数据**：`persona/chat.md` / `persona/work.md` 从退役插件**逐字提取**，唯一真源；
  改人格 = 开新卷（人设快照 + sha256 指纹），不是改代码。
- **双模式 sealed**：系统提示词只保留 persona 前缀，人设不被框架说明污染；能力通过工具、
  `variable`、`context`、`pre-step` 通道恢复，并补「能力总则」与「计划模式桥」。
- **四条上下文轨道**：称呼（120，`{{user_nickname}}`）、形态/场景（125）、道韵/风格（130）、
  世界书（140）；聊天模式全开，工作模式只留世界书。
- **截面镜像**：在 sealed 吞掉之前截获 DSH 原生 prompt section（`tool:*`/`plan:*`/未知段），
  以 context 原样回注；`deployment:*` 与人设正文永不镜像。

### 五育记忆

- **写入硬门槛**：溯源（用户原话或事件 id）、五育归属、决策类后果、基座只读；不过门槛进
  `余页/待定/`，月检/年检复检后可提升。
- **结构**：四问锚点 + 日档 + 月档/年轮 + 梦志 + 余页；写入 0600 权限、原子落盘。
- **记忆工具**：`memory_write/search/read/recall/update/forget/link/anchor/fs/pending/promote`、
  `memory_dream_journal`、`remember/forget`——仅昔涟预设可见。

### 夜梦与维护

- **逐会话夜梦**：`元/梦会话.json` 登记每个昔涟会话；设置面板勾选或
  `/cyrene dream on|off` 控制；每个启用会话各挂 23:30 任务，执行时写**一篇统合梦志**。
- **夜梦与日档分开**：梦志只记录模型六阶段整理产出（`memory_dream_journal`）；模型没写时
  只留「本次夜梦没有产出」说明，不自动复制日档。
- **维护 tick**：思源镜像、每日快照（保留 7 份）、月度五育体检、月/年滚动；默认开启、
  全部 fail-open。

### 思源镜像与灾难恢复

- 单向镜像到本地思源：锚点 / 条目 / 梦志 / 余页；默认开，30 分钟兜底，
  并在 `tool/result` / `turn/end` 触发 **1.5 秒防抖实时同步**。
- 恢复：`node scripts/restore-siyuan.mjs --dry-run` 演练 → 正式回灌（missing-only，按正文
  hash 去重）；本地每日快照优先。手册见 [docs/RECOVERY.md](docs/RECOVERY.md)。

### 命令与设置面板

| 入口 | 内容 |
|---|---|
| `/cyrene doctor` | 诊断根目录、persona 指纹、轨道/预算、记忆/待定、漂移、截面、夜梦、维护 |
| `/cyrene sync` / `/cyrene backup` | 立即同步思源 / 立即快照 |
| `/cyrene restore [force]` | 从思源回灌记忆（默认只补缺失） |
| `/cyrene dreams` / `/cyrene dream on\|off` | 夜梦会话清单 / 切换当前会话夜梦 |
| `/memory` / `/dream` | 记忆概览 / 手动六阶段整理 |
| 设置 →「昔涟 · 一页永恒」 | 锚点、记忆概况、卷记录、思源/夜梦/备份配置、逐会话夜梦开关、立即同步/备份/整理/恢复 |

## 两种模式

| 预设 id | 名称 | 基底 | 能力 | 轨道 |
|---|---|---|---|---|
| `chat` | 昔涟聊天模式 | standard | sealed 全能力 + 计划桥 | 称呼 / 形态 / 风格 / 世界书 |
| `cyrene-work` | 德谬歌工作模式 | cordis | sealed 全能力（含技能/插件管理） | 世界书 |

两者都不产生新的 prompt section；所有注入走 `context` / `variable` / `pre-step`。

## 快速开始

要求：DSH `>= 0.2.1-rc.2`；本插件无第三方运行时依赖，不需要 `npm install`。

```pwsh
# 1. 备份并导入旧数据（幂等；先停 DSH 更稳）
cd E:\DSH-workspace\dsh-cyrene-philia093-0
node scripts/import.mjs --dry-run
node scripts/import.mjs

# 2. 卸载旧插件（预设 id 冲突，必须先卸）
dsh plugin --profile desktop remove dsh-cyrene
dsh plugin --profile desktop remove dsh-cyrene-eternal-page-remembrance

# 3. 安装新插件（本地 link；也可用设置里的插件管理器）
dsh plugin --profile desktop add "link:E:/DSH-workspace/dsh-cyrene-philia093-0"

# 4. 重启 DSH，新建对话选择「昔涟聊天模式」/「德谬歌工作模式」
```

进入昔涟会话后执行 `/cyrene doctor` 自检；首次安装详细步骤、回滚见
[docs/MIGRATION.md](docs/MIGRATION.md)。

### 思源配置

思源桌面端默认 `http://127.0.0.1:6806`、笔记本 `93-昔涟`。API token 只从环境变量读：

```pwsh
setx SIYUAN_API_TOKEN "你的思源 API token"
```

地址/笔记本/开关/定时可在设置面板修改，落 `元/settings.json`（保存后重启生效）。
配置层级：默认值 ← Loader 行配置 ← `元/settings.json`。

## 记忆位置

```
<DSH_HOME>/cyrene-philia093-0/
  锚/            四问锚点
  日/YYYY/MM/    日档（当天事实 + 五育字段 + 溯源）
  月/ 年/        月档 / 年轮
  梦/YYYY-MM-DD.md  夜梦（模型六阶段产出；与日档分开）
  余页/           AI 自由写作 + 待定区（余页/待定/）
  元/            卷.json、settings.json、梦会话.json、索引、日志、worldbook/nickname/style
<DSH_HOME>/cyrene-philia093-0-snapshots/YYYY-MM-DD/   每日快照
```

根目录解析**永不落 CWD**：`DSH_HOME` 空白视为未设置，回落 `~/.dsh`。

## 架构与构建

```
persona/{chat,work}.md ─┐
modes/{chat,work}.mode.mjs ─┤
modes/base/{standard,cordis}.plugins.json ─┴─▶ scripts/build.mjs ─▶ cordis.patch.yml
```

- `cordis.patch.yml` 是**生成物**，不要手改；`npm run check` 校验与源一致。
- 人设只改 `persona/`；能力/模式只改 `modes/`；DSH 升级后重新快照 base，漂移检测会告警。
- 分层：宿主记忆服务（`host/`）→ 预置运行时（`runtime/`）→ 记忆引擎（`memory/`）→
  构建（`scripts/`）；契约单点维护在 [docs/CONTRACT.md](docs/CONTRACT.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 设计方案 v1.0（完整） |
| [docs/CONTRACT.md](docs/CONTRACT.md) | 跨插件/跨版本硬契约（预设 id、变量、order、存储、五育闸门、新卷） |
| [docs/MIGRATION.md](docs/MIGRATION.md) | 从旧插件迁到新卷（备份→导入→卸载→安装→校验→回滚） |
| [docs/RECOVERY.md](docs/RECOVERY.md) | 记忆丢失时的恢复手册（本地快照 → 思源副本 → 迁移备份） |
| [docs/BASELINE.md](docs/BASELINE.md) | 冻结的旧插件与逐轮实施/修复记录 |
| [philosophy/wuyu.md](philosophy/wuyu.md) | 五育 canonical 文本（逐字保留） |

## 开发与测试

```bash
npm test              # node --test "tests/*.test.mjs"（188 项）
npm run harness:check # 运行时代码语法检查
npm run build         # 生成 cordis.patch.yml
npm run check         # 生成一致性
npm run migrate -- --dry-run
```

- 零第三方运行时依赖；Windows + Linux CI 矩阵（`.github/workflows/test.yml`）。
- 人设类改动必须附 A/B 人设一致性结果；测试只用 `tests/fixtures/` 的合成样例。

## 版本与状态

- 当前版本：**v0.1.0**（首个公开版本，卷 0），发布说明见
  [docs/RELEASE-v0.1.0.md](docs/RELEASE-v0.1.0.md)。
- 已在桌面 profile 实机运行；已知边界：sealed 下 DSH 未来新增的身份类 section 不会被镜像，
  漂移检测 + doctor 告警；思源不可达只记日志。
- 变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可与声明

MIT。人设正文整理自 [Cyrene-Agent](https://github.com/Playa-Cyrene/Cyrene-Agent)（MIT）；
角色 IP 归 HoYoverse / 米哈游所有，含角色 IP 的衍生物禁止商业使用。
详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
