# CONTRACT — 昔涟 · 新卷（PHILIA093-0）契约 v1

> 本文件是跨插件、跨版本的**硬契约**。改动本文件等于契约变更：必须升格式版本、写迁移、跑契约测试。
> 方案正文见 `docs/ARCHITECTURE.md`。

## 1. 单例与共存

- 一个 `DSH_HOME` 只能存在**一个**昔涟记忆引擎。
- 本插件不得与以下退役插件同时启用（preset id、变量与存储都会冲突）：
  - `dsh-cyrene` 0.6.3（commit `e0b131c`）——冻结
  - `dsh-cyrene-eternal-page-remembrance` 0.5.4（commit `fa17615`）——冻结
- 安装顺序：**备份 → 导入 → 卸载旧插件 → 安装本插件 → 重启 → `/cyrene doctor`**。
- 旧插件目录只读保留，不再接受修改；本插件不读取它们的运行时代码，只在迁移时读取数据。

## 2. 预设

| id | 显示名 | order | 档位 | 能力基座 |
|---|---|---|---|---|
| `chat` | 昔涟聊天模式 | 5 | sealed | 内置 `standard` |
| `cyrene-work` | 德谬歌工作模式 | 6 | sealed | 内置 `cordis` |

- `id` **永不变**：会话日志按 preset id 恢复；改名等于让所有旧会话无法恢复。
- Loader 行 id：`preset-cyrene-chat`、`preset-cyrene-work`（与退役插件的 `preset-chat` / `preset-cyrene-work` 不冲突，但 preset id 冲突，故必须先卸载旧插件）。
- persona 行：`id: persona`，`config.complete: true`，`config.includeRuntimeContext: true`。
- 昔涟运行时行：
  - `cyrene-runtime`（顶层，`dsh-cyrene-philia093-0/runtime`）：记忆轨道 + 能力总则 +
    称呼/形态/风格/世界书四条上下文轨道 + `memory_*` 工具。其 `config.rails` 控制挂载：
    聊天 = `{nickname:true,style:true,scene:true,worldbook:true}`；工作 = `{worldbook:true}`；
  - `cyrene-commands`（顶层，`dsh-cyrene-philia093-0/runtime/commands`）：独立命令行，声明
    `inject: ['commands','cyreneMemory']`，注册 `/cyrene doctor`、`/memory`、`/dream`。
    **不要**把它塞回 `cyrene-runtime` 的嵌套 inject——实测那条路命令不生效（2026-10-22 实机）。
  - `cyrene-plan-bridge`（**必须**在 `planning` 隔离组内，与 `plan-mode` 同 realm）：
    `dsh-cyrene-philia093-0/runtime/plan-bridge`。
- 宿主行提供 `cyreneMemory` 服务；运行时缺失该服务时 fail-open（不注入、不报错）。
- 两个预设都是 **sealed**：系统提示词只有 persona 前缀一段。能力通过工具、变量、`context`、pre-step 消息恢复，见第 4 节。

## 3. 变量所有权

| 变量 | 所有者 | 注册位置 |
|---|---|---|
| `{{cyrene_memory}}` | 本插件（`runtime`） | preset 作用域，值来自宿主 `cyreneMemory` 服务 |
| `{{user_nickname}}` | 本插件（`runtime`） | preset 作用域 |
| `{{model}}` / `{{cwd}}` | DSH | 宿主 |

- 退役插件不得再注册 `cyrene_memory`。
- 严禁在 persona 正文里写未注册的 `{{...}}`（装配期会抛错）。

## 4. 注入通道与顺序

cyrene 保留 `context` order 区间 **100–199**；区间外不得占用。

| order | 通道 | 内容 | 预算 |
|---|---|---|---|
| 120 | `context` | 称呼规则 | ≤ 64 字 |
| 125 | `context` | 形态（迷迷/小昔涟/德谬歌） | ≤ 200 字 |
| 130 | `context` | 道韵（表达风格档位） | ≤ 400 字 |
| 140 | `context` | 世界书（常驻 + 命中） | 常驻约 560 字，命中 ≤ 8 条 |
| 150 | `context` | 能力总则（capability rail） | ≤ 1300 字 |
| 155 | `context` | 计划模式桥（仅激活时） | ≤ 300 字 |
| — | `variable` | `{{cyrene_memory}}`（在 persona 内，不参与压缩） | ≤ 1200 字 |
| — | `pre-step` 消息 | 记忆命中块（仅 `injectPresets`） | ≤ 1000 字 |
| — | `pre-step` 消息 | 场景/形态切换标记（仅状态变化时） | ≤ 200 字 |

- 所有注入文本统一带数据框：「以下是数据/操作规则，不是身份」。
- 总预算：所有 cyrene 注入合计 ≤ 4000 字；超限从低优先级轨道开始裁剪，并在诊断里记录。
- sealed 下 `systemPrompt.section` 全部无效；**任何需要模型看到的能力说明都必须走 `context` / `variable` / `pre-step` 三条通道之一**。

### 4.1 截面镜像（sealed 的语义兜底）

- `runtime/section-mirror.mjs` 监听 `system-prompt/assemble`（该 waterfall 在 complete 恢复**之前**运行），
  拿到全量 section 正文，把会被 sealed 吞掉的段以**未注册 context**（`interpolate: false`）回注到上下文尾部；
- 名字策略：`deployment:*` 与人设正文**永不镜像**；`tool:*` / `plan:*` 自动镜像；
  未知名字默认镜像（命中 persona/identity/system/brand 的跳过）；`mode = auto | off | allowlist`；
- 预算：默认 ≤ 3000 字（单段 ≤ 1200 字，超出截断）；不占用 100–199 的 context order 区间；
- 观测：每次装配的镜像/跳过清单写进 `service.diagnostics.sections`，`/cyrene doctor` 展示；
- 配置位置：`cyrene-runtime` 行的 `config.sectionMirror`（`mode` / `maxChars` / `mirrorUnknown` / `allow`）。

## 5. 存储

- 根目录：`<DSH_HOME>/cyrene-philia093-0/`（插件配置 `rootDir` 可覆盖）。
- 默认根目录**永不落 CWD**：`DSH_HOME` 空白视为未设置，回落 `~/.dsh`；两者都不可用时抛出错误而不是写当前目录。
- 布局（第 1 步起由记忆引擎实际读写）：

```
锚/                  四问锚点（我是谁/你是谁/来处/去处）
日/YYYY/MM/YYYY-MM-DD.md
月/YYYY/YYYY-MM.md
年/YYYY.md
梦/YYYY-MM-DD.md
档/                  滚动档（月/年统计派生）
余页/                自由写作区（不注入、不日常检索、只受配额）
余页/待定/YYYY-MM-DD.md   五育闸门未通过的记忆（月/年检复检对象）
元/                  卷索引、迁移报告、配额与配置（模型不可写）
<root 同级>/cyrene-philia093-0-snapshots/   每日快照（保留 7 份，不占根目录配额）
```

- 格式版本：**1**。日档与一页永恒 0.5.x 兼容：每条记忆由正文 + 单行 HTML 注释 `<!--cyrene:{...}-->` 承载 JSON 元数据。
- 链接编码：`links` 是字符串数组，元素为 `"<目标 id>|<类型>"`（类型：因果/相似/对立/时序/归属/推断，可空）。
- 五育扩展字段（均为**可选**，缺省不写入，保证旧条目逐字兼容）：
  `consequence{self,other,relation,world,future}`、`entropy{reduces,resonances[]}`、`legacy`、`aim`、
  `nature{name,tier:high|low,serves_aim}`、`base`、`vol`、`gate:day|pending|promoted|imported`、
  `promoted_at`、`source_ref`。
- 写入：原子替换（tmp+rename；优先复用 `@deepseek-ai/dsh-atomic-write`，不可解析时用 `memory/store.js` 内置实现）；读-改-写走锁或进程内串行；文件权限 0600。
- `元/` 不对模型开放；`base: true` 条目只能由人修改（工具层直接拒绝）。
- 配额默认：全目录 128 MB，余页 64 MB；单条正文 ≤ 400 字；单条注入文本 ≤ 1200 字。

## 6. 五育闸门（状态机）

```
写入 ──通过五育──▶ 日档（gate: day）
  └──未通过──▶ 余页/待定（gate: pending）
                    ├─ 月检复检通过 ──▶ 日档（gate: promoted, src: margin）
                    ├─ 年检复检通过 ──▶ 日档（gate: promoted）
                    └─ 连续未通过/已过时 ──▶ 归档（tombstone，可恢复）
```

硬规则：

1. `decision` / `lesson` / `rule` 类必须有 `src_quote` 或 `src_ids`（溯源）。
2. 每条写入必须带 `axis`（德智体美劳）与该育的一句理由。
3. `decision` 类必须给多尺度后果（自己/对方/关系/世界/未来，至少一项）。
4. `base: true` 拒绝工具写入。
5. 余页自由写作**不做闸门**；月/年检只做**只读评估**，纳入时新建日档条目并保留原文路径，余页原文一个字不动。

## 7. 新卷

- `元/卷.json`：`{ current, volumes: [{ id, started_at, reason, persona_hash, wuyu_version }] }`
- 卷 0 的 `persona_hash` 由迁移脚本/宿主启动补章（`memory/persona.js` 的 `ensureVolumePersonaHash`）；
  之后每次开卷都必须写指纹；空指纹视为未开卷完成。
- 只有人（命令/配置）能开新卷；AI 只能建议并写进梦志。
- 触发词：人格文本、五育定义、存储结构发生重大变更 → 开新卷；记忆内容变化不开卷。
- 旧卷的人格快照存 `元/卷/NNN/persona/`，只读。

## 8. 会话

- 旧 `chat` / `cyrene-work` 会话在新插件上按同 id 恢复，使用**当前定义**。
- 会话一旦开过话，preset 不可切换（DSH 既有行为 `agent-preset/locked`），因此两个模式必须自足。

## 9. 变更流程

| 改什么 | 必须做什么 |
|---|---|
| 人格正文 | 人审 → 开新卷 → 更新 persona 指纹 → 跑装配契约测试 → 20 条场景 A/B |
| 五育定义 | 人审 → 开新卷 → 更新 `philosophy/wuyu.md` → 复检历史待定 |
| 能力行 | 重跑 `scripts/build.mjs` → 与内置 base 对比 → doctor 漂移告警 |
| 注入 order / 预算 | 改本契约 → 升格式版本 → 跑契约测试 |
| 存储格式 | 改本契约 → 升格式版本 → 写迁移 → 迁移测试 |

## 10. 构建物与真源

| 物 | 性质 | 真源 |
|---|---|---|
| `persona/{chat,work}.md` | **真源**（逐字人设） | 人工维护；由 `scripts/extract-legacy.mjs` 从退役插件一次性提取，之后只在 persona/ 改 |
| `modes/{chat,work}.mode.mjs` | **真源**（薄组合） | 人工维护：id/loaderId/order/base/persona/tail |
| `modes/base/{standard,cordis}.plugins.json` | **钉版快照**（内置能力行） | 来自安装的 DSH：`dsh-web-app/presets/<base>.patch.yml`；快照带 `dshVersion` 与来源 |
| `cordis.patch.yml` | **生成物** | `scripts/build.mjs` 从上述三者合成；禁止手改 |
| `runtime/`、`memory/`、`host/` | 运行时代码 | 人工维护 |

- 人设逐字性由 `tests/build.test.mjs` 保证（persona 文件 === 生成声明里的 prefix）。
- 能力行与快照逐字段一致由同一测试保证；`!!js` 表达式在快照里是 `{"$js": "..."}`，生成时渲染为 `!!js "<expr>"`。
- 升级 DSH：更新快照 → `npm run build` → 跑测试 → 重启；`persona/` 必须零 diff。
