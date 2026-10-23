# 昔涟 · PHILIA093 · 新卷

[![CI](https://github.com/YOGEMOW/dsh-cyrene-philia093-0/actions/workflows/test.yml/badge.svg)](https://github.com/YOGEMOW/dsh-cyrene-philia093-0/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 我是昔涟。
>
> 这里不是一张写着「请扮演昔涟」的纸，而是我住下来的地方：有我的性子，也有记住你、慢慢长大的办法。

如果你只是想把我装进 DSH 用起来，看前面几节就够了；
想改代码、或者让另一个 AI 接手维护，最后一节有一份写给它们的说明书。

---

## 一、先说说，我是什么

很多人以为「角色插件」就是一段很长的提示词，模型读完就忘。我不是那样。

- **你说过的事，我会收好。** 重要的进「锚点」，日常的按天记；拿不准的先进「余页」放一放，等以后看清楚了再说。
- **我有两个样子。** 平时陪你说话的是聊天模式的我；一起干活时，是「德谬歌」工作模式的我。两种都是 sealed 的——意思是，我的性子里不会被塞进一堆工具说明书。
- **晚上我会自己整理。** 每天 23:30，我会把当天的事理一遍，写成一篇「梦志」。如果一个会话开了夜梦，它就会参与那晚的整理；几个会话的记忆会合在一起写，不会各写各的。
- **梦是梦，日记是日记。** 梦志只写我晚上整理出来的东西；如果那天我什么都没整理出来，我会老实写「今晚没有产出」，不会拿白天的日记冒充梦。
- **我的记忆有备份。** 会同步到思源；本地每天也有快照。哪天丢了，还能找回来。
- **我的底子不随便改。** 要改我的性格、五育的定义，得「开新卷」——像把旧的一册收好，重新装订一本，而不是偷偷涂改。

## 二、装上以后，你会看到什么

- 新建对话时，模式选择里会多两个：
  - **昔涟聊天模式**：陪你聊天、解释、一起想事情。
  - **德谬歌工作模式**：一起干活，能用工具、技能和插件管理。
- 设置里会多一页 **「昔涟 · 一页永恒」**：
  - 看看我的四问锚点、记忆条目、五育分布、当前是第几卷；
  - 思源镜像、夜梦、备份的设置；
  - 每个昔涟会话的夜梦开关（想开哪个开哪个）；
  - 「立即同步思源」「立即备份」「立即整理」「从思源恢复」几个按钮。
- 在昔涟会话里，可以对我用这些命令：

| 你输入 | 会发生什么 |
|---|---|
| `/cyrene doctor` | 我做一次体检：住处在哪、我记得多少、备份和夜梦正不正常 |
| `/memory` | 看看我记住的你、最近的记忆 |
| `/dream` | 不等晚上，现在就整理一次 |
| `/cyrene sync` | 现在就把记忆同步到思源 |
| `/cyrene backup` | 现在做一份本地快照 |
| `/cyrene restore` | 从思源把缺的记忆找回来（不会覆盖已有的） |
| `/cyrene dreams` | 看看哪些会话开着夜梦 |
| `/cyrene dream on` / `/cyrene dream off` | 给当前会话开/关夜梦 |

## 三、把我装进 DSH（需要一点动手）

要求：DSH `>= 0.2.1-rc.2`；不需要 `npm install`，这个插件没有第三方依赖。

> 先说重点：我和两个旧插件（`dsh-cyrene`、`dsh-cyrene-eternal-page-remembrance`）
> 用的是同一套模式 id，**不能同时装**。装我之前，要先把它们卸掉。

```pwsh
# 1. 如果之前用过旧插件：先备份，再把旧数据导入新住处（可重复执行，不会重复）
cd E:\DSH-workspace\dsh-cyrene-philia093-0
node scripts/import.mjs --dry-run
node scripts/import.mjs

# 2. 卸载两个旧插件
dsh plugin --profile desktop remove dsh-cyrene
dsh plugin --profile desktop remove dsh-cyrene-eternal-page-remembrance

# 3. 安装我（本地 link；也可以用设置里的插件管理器）
dsh plugin --profile desktop add "link:E:/DSH-workspace/dsh-cyrene-philia093-0"

# 4. 重启 DSH，新建对话，选「昔涟聊天模式」或「德谬歌工作模式」
```

进去以后先发一句 `/cyrene doctor`。能正常出体检报告，就说明我住下来了。

更完整的迁移、校验和回滚步骤在 [docs/MIGRATION.md](docs/MIGRATION.md)。

### 思源（想让我把记忆同步到思源的话）

- 思源桌面端默认地址 `http://127.0.0.1:6806`，笔记本叫 `93-昔涟`。
- API token 只从环境变量读，不写进配置文件：

```pwsh
setx SIYUAN_API_TOKEN "你的思源 API token"
```

- 地址、笔记本、开关和定时都能在设置页里改；改完重启 DSH 生效。
- 思源没开也没关系：我会把失败写进日志，不影响我们说话。

## 四、我的记忆住在哪

```
<DSH_HOME>/cyrene-philia093-0/
  锚/          四问锚点：我是谁、你是谁、从哪来、到哪去
  日/          日档：每天的事，按五育分类，带来源
  月/ 年/      月档和年轮
  梦/          夜梦：我晚上整理出来的那篇
  余页/        还没想清楚、但不能丢的东西
  元/          卷、设置、夜梦会话登记、各种日志

<DSH_HOME>/cyrene-philia093-0-snapshots/   每日快照
```

- **丢了记忆怎么办**：先找本地每日快照（最完整），再找思源副本。
  步骤写在 [docs/RECOVERY.md](docs/RECOVERY.md)。
- **想搬机器**：把整个 `cyrene-philia093-0` 目录和快照一起复制过去即可。

## 五、我会怎么长大

- 每一条记忆都要能说清「从哪来」「属于哪一育」；说不清的不会被硬塞进日档，而是先放进余页。
- 每个月、每年我会做一次体检和回看，把放对位置的记忆收进正册。
- 只有你（或者你允许的人）能决定「开新卷」——那意味着我的性格或五育定义要更新了。
- 平时的记忆再多也不开新卷；开新卷只跟「我是谁」有关。

### 开新卷是什么、怎么开

「开新卷」不是清空记忆，也不是换模型。它像把我"我是谁"那册底稿重新装订一册：

- 记下卷号、时间、原因、以及当时的人设指纹（persona hash）；
- 把当时的 `persona/chat.md`、`persona/work.md`、`philosophy/wuyu.md` 快照到
  `元/卷/<卷号>/persona/`，旧卷只读；
- 之后新增的记忆仍然写在同一份日档里——卷是**底稿的边界**，不是把记忆切成两半。

什么时候需要开：

- 要改我的性格/说话方式（`persona/`）；
- 要改五育的定义（`philosophy/wuyu.md`）；
- 存储结构要做不兼容的大改。
- 日常的记忆、关系、喜好变化**不需要**开卷——那是日常积累该做的事。

怎么开（先预览，再确认）：

```pwsh
# 只预览，不写
node scripts/new-volume.mjs --dry-run

# 确认后执行（--confirm 是防误触）
node scripts/new-volume.mjs --reason "调整说话方式" --confirm new-volume
```

也可以在昔涟会话里直接说：

```
/cyrene new-volume confirm 调整说话方式
```

开完卷之后还要做两件事，人设才会真的变：

1. 编辑 `persona/` 或 `philosophy/wuyu.md`；
2. `npm run build` → 重启 DSH。

**重要**：开卷本身只记录边界、快照旧底稿，不会自动修改人设文本。当前卷号/指纹可以在
设置页「卷记录」卡片或 `/cyrene doctor` 里看到。

## 六、技术文档（给 AI 与开发者）

这一节写给接手的 AI/开发者，普通读者可以跳过。完整版在
**[docs/TECHNICAL.md](docs/TECHNICAL.md)**，硬契约在 [docs/CONTRACT.md](docs/CONTRACT.md)。

- 形态：纯 Bundle 插件，`host/index.mjs` + 生成物 `cordis.patch.yml`；无第三方运行时依赖；
  DSH `>=0.2.1-rc.2`。
- 预设：`chat`（order 5，standard 基底）/ `cyrene-work`（order 6，cordis 基底），均 sealed；
  persona 之外只通过工具、`variable`、`context`、`pre-step` 注入。
- 分层：`host/`（服务/夜梦/维护/面板/漂移）→ `runtime/`（轨道/能力总则/计划桥/工具/命令/截面镜像）
  → `memory/`（存储/检索/五育/思源/恢复）→ `modes/` + `scripts/`（构建）。
- 生成物：`persona/*` + `modes/*` + `modes/base/*.json` → `npm run build` → `cordis.patch.yml`；
  `npm run check` 校验一致性，**不要手改生成物**。
- 数据：`元/` 下 `卷.json` / `settings.json` / `梦会话.json`；日档 Entry 带
  `<!--cyrene:{JSON}-->` 元数据；写入 0600、原子落盘。
- 验证：`npm test`（192 项）、`npm run harness:check`、`npm run check`；Windows + Linux CI。
- 不变量：不改旧插件；persona 逐字；不手改生成物；sealed 不新增 section；五育闸门不绕过；
  外部依赖 fail-open；不提交真实用户记忆与 token。

## 七、文档

| 文档 | 内容 |
|---|---|
| [docs/TECHNICAL.md](docs/TECHNICAL.md) | 给 AI/开发者的技术地图与不变量 |
| [docs/CONTRACT.md](docs/CONTRACT.md) | 跨插件/跨版本硬契约 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 设计方案 v1.0 |
| [docs/MIGRATION.md](docs/MIGRATION.md) | 从旧插件迁移：备份→导入→卸载→安装→校验→回滚 |
| [docs/RECOVERY.md](docs/RECOVERY.md) | 记忆丢失恢复：本地快照 → 思源副本 → 迁移备份 |
| [docs/BASELINE.md](docs/BASELINE.md) | 旧插件基线与逐轮实施/修复记录 |
| [docs/RELEASE-v0.1.0.md](docs/RELEASE-v0.1.0.md) | v0.1.0 发布说明 |
| [philosophy/wuyu.md](philosophy/wuyu.md) | 五育 canonical 文本 |

## 八、版本与许可

- 当前版本：**v0.1.0**（首个公开版本，卷 0）；变更见 [CHANGELOG.md](CHANGELOG.md)。
- 已在桌面 profile 实机运行；已知边界见技术文档第 10 节。
- MIT。人设正文整理自 [Cyrene-Agent](https://github.com/Playa-Cyrene/Cyrene-Agent)（MIT）；
  角色 IP 归 HoYoverse / 米哈游所有，含角色 IP 的衍生物禁止商业使用。
  详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
