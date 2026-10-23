# 技术文档（给 AI 与开发者）

面向接手本仓库的 AI/开发者。普通读者看 [README](../README.md) 即可，不必读这篇。
硬契约以 [CONTRACT.md](CONTRACT.md) 为准；本文是架构与操作地图。

## 1. 项目是什么

- 包名：`dsh-cyrene-philia093-0`，版本 `0.1.0`。
- 类型：**纯 Bundle 插件**（不含客户端构建链、无第三方运行时依赖），随 DSH `>=0.2.1-rc.2` 运行。
- 入口：`host/index.mjs`（宿主行）＋ `cordis.patch.yml`（两个预设声明）。
- 合并并取代：`dsh-cyrene` 0.6.3 与 `dsh-cyrene-eternal-page-remembrance` 0.5.4。
  旧插件仓库只读，不得修改。
- **不共存**：新插件沿用预设 id `chat` / `cyrene-work`；同一 `DSH_HOME` 只能有一个昔涟记忆引擎。

## 2. 目录与职责

| 路径 | 职责 |
|---|---|
| `persona/{chat,work}.md` | 人设真源（逐字）；改动=开新卷 |
| `philosophy/wuyu.md` | 五育 canonical 文本（逐字） |
| `modes/{chat,work}.mode.mjs` | 薄组合：id/loaderId/order/base/persona/tail/groupPatches |
| `modes/base/{standard,cordis}.plugins.json` | 内置预设行快照（含 `dshVersion`、来源） |
| `scripts/build*.mjs` | 从 persona+modes+base 生成 `cordis.patch.yml`（禁止手改生成物） |
| `scripts/import.mjs` | 旧数据幂等迁移（旧 md + 一页永恒目录） |
| `scripts/restore-siyuan.mjs` | 从思源回灌记忆（dry-run/force） |
| `host/` | 宿主半：`cyreneMemory` 服务、漂移、夜梦、维护、面板路由 |
| `runtime/` | 预设半：轨道、能力总则、计划桥、记忆工具、命令、截面镜像 |
| `memory/` | 记忆引擎（从一页永恒迁入）：解析/存储/检索/注入/五育/夜梦/思源/恢复 |
| `client.js` | Client 半：设置面板、会话头徽标 |
| `tests/` | 192 项单元/契约/迁移/恢复测试，合成数据 |
| `docs/` | 架构、契约、迁移、恢复、基线、发布说明 |

## 3. 组合与预设

生成器输出到 `cordis.patch.yml`：

| 预设 id | order | base | 档位 | tail | groupPatches |
|---|---|---|---|---|---|
| `chat` | 5 | standard | sealed | `cyrene-runtime`、`cyrene-commands` | `planning` 组内 `cyrene-plan-bridge` |
| `cyrene-work` | 6 | cordis | sealed | 同上 | 同上 |

- **sealed**：`persona` 行 `config.complete: true`，系统提示词只保留 persona 前缀。
- 能力恢复通道：工具、`variable`、`context`（order 120/125/130/140/150/155）、`pre-step` 插件消息；
  **不得**注册新的 prompt section（sealed 下无效且会误导）。
- `runtime/section-mirror.mjs`：监听 `system-prompt/assemble`（complete 恢复**之前**），
  把 sealed 会吞掉的 section 以未注册 context（`interpolate:false`）回注；
  `deployment:*`/人设正文永不镜像。
- `runtime/capability.mjs`、`runtime/plan-bridge.mjs`：跨工具规则与计划模式桥；计划桥必须在
  `planning` 隔离组内。

## 4. 宿主与运行时

### host

- `host/index.mjs`：解析配置（行配置 ← `元/settings.json`）→ 建 `cyreneMemory` 服务 →
  补卷 0 `persona_hash` → 夜梦/维护/面板/漂移检测（全部 fail-open）。
- `host/memory-service.mjs`：纯服务工厂（root/config/append/entries/quota/anchor/readMeta…）。
- `host/dream.mjs`：逐会话夜梦登记、日程、标记处理、租约、收尾、统合提示词。
- `host/maintenance.mjs`：30 分钟 tick + `flushSoon`（`tool/result`/`turn/end` 1.5s 防抖镜像）、
  每日快照、月度体检、月/年滚动。
- `host/panel.mjs`：`/dsh-cyrene-philia093-0/{status,session,action}` HTTP 路由。
- `host/drift.mjs`：用 `agentPresets.readDocument` 对比内置预设行 id，仅告警。

### runtime

- `runtime/index.mjs`：按 `config.rails` 挂载能力总则、记忆轨道、称呼/形态/风格/世界书；
  注册记忆工具（preset 作用域）；`agent/created` 时给每个 agent 装截面镜像。
- `runtime/tools.mjs`：`memory_write/search/read/recall/update/forget/link/anchor/fs/pending/promote`、
  `memory_dream_journal`、`remember/forget`。
- `runtime/wuyu.mjs`：五育硬门槛；`runtime/review.mjs`：待定复检/提升/月检/年检；
  `runtime/volume.mjs`：新卷（人格快照 + sha256，只增不改）。
- `runtime/commands.mjs`：独立预设行（`inject: ['commands','cyreneMemory']`）注册
  `/cyrene doctor|sync|backup|restore|dreams|dream on/off`；`/memory`、`/dream`。

## 5. 存储格式

根目录 `<DSH_HOME>/cyrene-philia093-0/`，默认绝不落 CWD。

```
锚/                四问锚点（frontmatter + 正文）
日/YYYY/MM/YYYY-MM-DD.md   日档：frontmatter + 每条 Entry + <!--cyrene:{JSON}--> 元数据
月/ 年/            月档 / 年轮
梦/YYYY-MM-DD.md   夜梦（模型六产出的整理；与日档分开，不复制日档）
余页/              自由写作；余页/待定/ 为闸门未过条目
元/                卷.json、settings.json、梦会话.json、索引、日志、worldbook/nickname/style
```

- Entry 必填 `id/text/kind/axis/q/I/S/status`，可选五育扩展（`consequence/entropy/legacy/aim/nature`）；
  `links` 为 `"<id>|<type>"`；`base:true` 仅人能写。
- 写入 0600、原子替换；`resolveRoot` 在 `DSH_HOME` 缺失时回落 `~/.dsh`。
- 快照：`<DSH_HOME>/cyrene-philia093-0-snapshots/YYYY-MM-DD/`，保留 7 份。

## 6. 五育闸门与生命周期

1. 写入必须能溯源（`src_quote` 或 `src_ids`）、有 `axis`、决策类有 `consequence`；`base` 只读。
2. 未通过 → `余页/待定/`（不是丢弃）。
3. 月检/年检复检并提升；月检写五育体检年轮；月/年滚动幂等。
4. 改人格/五育/存储结构 = **开新卷**（人格快照 + `persona_hash`，旧卷只读）。
   入口：`scripts/new-volume.mjs`（`--dry-run` / `--confirm new-volume`）或
   `/cyrene new-volume confirm <原因>`；开卷只记录边界+快照，**不改人设文本**，
   改文本仍需编辑 `persona/` → `npm run build` → 重启。

## 7. 夜梦与思源

### 夜梦

- 登记表 `元/梦会话.json`：每会话 `enabled/lastActiveAt/lastUserText/preset`，默认启用。
- 每个启用会话各挂 23:30 任务；任一启用会话的标记到达即领租约；其余会话当天跳过。
- 提示词带「参与今晚统合的会话 + 最近一句」，要求只写一篇统合梦志。
- 模型经 `memory_dream_journal` 写 `梦/YYYY-MM-DD.md`；没写时收尾只记
  「本次夜梦没有产出」，**绝不复制日档**。
- 未登记（旧/死）会话的标记会被丢弃；启动时清理其日程。

### 思源

- 配置：默认 `http://127.0.0.1:6806` / `93-昔涟` / `/一页永恒`；token 只读环境变量
  `SIYUAN_API_TOKEN`。
- 配置优先级：默认值 ← Loader 行配置 ← `元/settings.json`；改后重启生效。
- 镜像：锚点/条目/梦志/余页；30 分钟兜底 + 写后 1.5s 防抖 `flushSoon`；失败只记日志。
- 恢复：`restore-siyuan.mjs`（默认 missing-only、hash 去重；`--force --yes` 覆盖锚点/梦志）。
- 面板 API：`GET /status`、`GET /session?sessionId=`、`POST /action`
  （`sync|backup|dream|dream-session|restore|save-config`）。

## 8. 构建、测试与发布

```bash
npm test              # 192 项
npm run harness:check # node --check 全部运行时代码（含 client.js）
npm run build         # 生成 cordis.patch.yml
npm run check         # 生成一致性
npm run migrate -- --dry-run
```

- CI：`.github/workflows/test.yml`，Windows + Linux 矩阵。
- 发布：版本号三处一致（`package.json` / `dsh.plugin.json` / `plugin.json`），
  `CHANGELOG.md` 有对应条目，`tests/version.test.mjs` 校验；发版打 tag，发布说明
  `docs/RELEASE-vX.Y.Z.md`。
- 备份：`E:\Git\repositoris\dsh-cyrene-philia093-0` 是 GitHub 的镜像克隆。

## 9. 不变量（AI 维护者必须遵守）

1. **不修改旧插件仓库**；旧插件只读。
2. **persona/ 与 philosophy/wuyu.md 逐字保留**；改动走新卷，并跑人设 A/B。
3. **不手改 `cordis.patch.yml`**；改 `persona/`/`modes/` 后 `npm run build`。
4. 双模式保持 sealed；能力只走 context/variable/pre-step，不新增 prompt section。
5. 五育闸门与 `base` 只读不可绕过；AI 不得写 `base:true`。
6. 所有宿主/外部调用 fail-open；思源/日程不可用时不得阻塞会话。
7. 测试只用 `tests/fixtures/` 合成数据；不提交真实用户记忆。
8. 无第三方运行时依赖；不把 token 写进配置/日志/仓库。

## 10. 已知边界

- sealed 下 DSH 未来新增的**身份类** section 不会被截面镜像自动恢复；靠漂移 + doctor 人工判断。
- 夜梦依赖本地 `schedule` 服务与会话活动；没有活跃会话时只能等用户下次说话。
- 思源镜像只保证「曾经成功镜像」的内容；从未同步的记忆只能靠本地快照。
- 恢复条目的原始时间会落到恢复当天（正文与五育字段保留）。

更细的契约：`docs/CONTRACT.md`；实施与修复记录：`docs/BASELINE.md`。
