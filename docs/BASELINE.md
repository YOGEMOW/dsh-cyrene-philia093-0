# BASELINE — 冻结基线（第 0 步）

> 本文件记录新卷开工时被冻结的两个旧插件。它们是**只读对照基线**：不改、不装（安装新卷前卸载）、只在迁移与等价性测试时读取数据。

## 1. 冻结对象

| 插件 | 版本 | commit | 路径 | 角色 |
|---|---|---|---|---|
| `dsh-cyrene` | 0.6.3 | `e0b131c` | `E:/Git/repositoris/DSH-Cyrene` | 人设语料、世界书、称呼/风格/场景、预设声明、能力抄本 |
| `dsh-cyrene-eternal-page-remembrance` | 0.5.4 | `fa17615` | `E:/DSH-workspace/cyrene-eternal-page-remembrance` | 记忆引擎（四问/日档/月档/年轮/夜梦/余页/配额/思源/快照） |

冻结时间：2026-10-22。

## 2. 从旧插件带进新卷的资产

### 2.1 人设语料（来自 dsh-cyrene）

- `preset/chat/agent.cordis.yml` 的 persona 正文（`chat` 组）
- `preset/cyrene-work/agent.cordis.yml` 的 persona 正文（`work` 组）
- `worldbook/data/*.md`（61 条设定）
- `styles/0X_*.md`（五档表达风格）
- `LICENSES/Cyrene-Agent-LICENSE.txt`、`THIRD_PARTY_NOTICES.md` 的上游声明

**原则**：正文逐字保留，只做文件重组与拼装；不改写上游文本。

### 2.2 记忆引擎（来自一页永恒）

- `CONTRACT.md` 的数据模型与日档格式
- `lib/` 的 parse / store / search / dream / audit / siyuan 语义
- 五育自检的 canon 文本（并入 `philosophy/wuyu.md`）

### 2.3 明确不带的

- 旧的 `complete: true` 一刀切策略（新卷用 sealed + 能力桥接）
- 旧的 `memory.js` / `remember` / `forget`（并入新记忆引擎）
- 旧的 `cordis.patch.yml` 预设段（新卷由构建器生成）
- 旧的两套 `{{cyrene_memory}}` 注册（新卷只保留一个所有者）
- 旧的技术文档（重写）

## 3. 基线数据（第 0 步采集）

`tests/fixtures/baseline/` 下的文件用于后续的等价性与回归测试：

| 文件 | 内容 |
|---|---|
| `presets.json` | 两个旧预设的行 id、persona 档位、与内置 standard/cordis 的差异（行集基线） |
| `legacy-memory.sample.md` | 旧 `cyrene-memory.md`（remember/forget）的合成样例 |
| `eternal-day.sample.md` | 一页永恒日档格式的合成样例（含元数据注释） |
| `eternal-entry.sample.json` | Entry 数据形状样例 |

**注意**：样例全部是合成数据，**不含任何真实用户记忆**。

## 4. 基线使用规则

1. 旧插件目录只读；不得再提交任何修改。
2. 第 1 步的等价性测试以本基线为准：新引擎对同一输入的解析/检索/写入结果必须与旧引擎一致（语义等价，允许内部字段扩展）。
3. 迁移测试只使用 `tests/fixtures/baseline/` 的合成样例，不读取真实 `~/.dsh`。
4. 基线文件本身变更 = 契约变更，需在 `docs/CONTRACT.md` 里记一笔。

## 5. 第 1 步实际执行结果（2026-10-22）

- 引擎迁入：`cyrene-eternal-page-remembrance/lib/*.js`（18 个模块）→ `memory/`，逐字复制后只做三处适配：
  1. 默认根目录名改为 `cyrene-philia093-0`；
  2. `resolveRoot` 的空值兜底改为**永不落 CWD**（空白 `DSH_HOME` 回落 `~/.dsh`，都不可用则抛错）；
  3. `normalizeEntry` 增加五育扩展字段（只收非空值，旧条目序列化逐字不变）。
- 等价性：旧引擎的 16 个测试文件迁入 `tests/`（`memory-*.test.mjs`）并全部通过，共 121 项。
- 新增：`tests/memory-philia.test.mjs`（4 项：五育字段往返、旧条目兼容、根目录不落 CWD、基线日档解析）。
- 迁移：`scripts/import.mjs` 实测——旧 `cyrene-memory.md` 3 条 → 导入 3 条、重复 3 条；一页永恒目录复制 1 个文件；写 `元/卷.json` 与 `元/迁移报告.md`。
- 已知未做：引擎内的品牌文案（`指南.md`/`prompt.js` 仍写「一页永恒」）留到第 3 步统一替换；`memory/inject.js` 尚未接入 runtime。

## 6. 第 2 步实际执行结果（2026-10-22）

- 人设提取：`scripts/extract-legacy.mjs` 从 `E:/Git/repositoris/DSH-Cyrene` 的 persona 块标量逐字提取：
  - `persona/chat.md`：852 行 / 14093 字符；
  - `persona/work.md`：666 行 / 10908 字符；
  - `--check` 与源逐字一致。
- 内置 base 快照：`modes/base/standard.plugins.json`（22 行）、`cordis.plugins.json`（23 行），
  来自 `app.asar:/dsh/node_modules/@deepseek-ai/dsh-web-app/presets/*.patch.yml`，`dshVersion = 0.2.1-rc.2`；
  `!!js` 表达式保存为 `{"$js": "..."}`。
- 构建：`scripts/build.mjs` 生成 `cordis.patch.yml`（54 KB，2 个预设声明）；
  PyYAML 校验通过；声明对象与渲染后 YAML **逐字段 round-trip 一致**（开发期校验，不入库）。
- 测试：`tests/build.test.mjs` 7 项通过（生成一致、预设元数据、sealed persona、能力行与快照一致、
  生成确定性、路径前置校验、人设逐字提取）。
- 已知未做：`modes/*.mode.mjs` 的 `tail` 仍为空 —— 第 3 步接入 runtime 轨道与能力总则/计划桥。

## 7. 第 3a 步实际执行结果（2026-10-22）

- 宿主：`host/index.mjs` 读取行配置 → `resolveConfig` → `createMemoryService` → `ensureTree` →
  `ctx.provide('cyreneMemory', service)`；服务缺失/初始化失败一律 fail-open。
- 运行时（preset 作用域）：
  - `runtime/rails.mjs`：注入 order 表（120–155）与预算、plugin 消息构造（`source.kind = plugin:cyrene-philia093-0`）；
  - `runtime/capability.mjs`：context order 150 的能力总则（≤1300 字）；
  - `runtime/plan-bridge.mjs`：独立行，插进 `planning` 隔离组，按 `ctx.planMode.get(agent).active` 出文本（order 155）；
  - `runtime/memory-rail.mjs`：`{{cyrene_memory}}` 指针变量 + pre-step 首轮快照/命中/压缩（`compaction/end`）后重注入。
- 构建：`modes/*.mode.mjs` 增加 `tail`（`cyrene-runtime`）与 `groupPatches.planning`（`cyrene-plan-bridge`）；
  `cordis.patch.yml` 行数变为 chat 23 / work 24；PyYAML 校验与声明 round-trip 均通过。
- 测试：新增 `tests/runtime.test.mjs` 5 项（能力总则、计划桥、记忆轨道快照/去重/压缩重注入、注入开关、宿主服务），
  全量 133 项通过。
- 已知未做（第 3b）：称呼/形态/风格/世界书轨道、memory_* 工具与五育闸门；夜梦/思源在第 4/6 步。

## 8. 第 4 步实际执行结果（2026-10-22）

- 五育闸门：`runtime/wuyu.mjs`。硬规则——text 必填、axis 必填、必须有溯源（`src_quote` 或 `src_ids`）、
  `decision` 类必须有多尺度后果、`base:true` 直接拒绝。通过 → 日档（`gate:day`）；
  不通过 → `余页/待定/YYYY-MM-DD.md`（`gate:pending`），返回「还差什么」。
- 待定区：`memory/pending.mjs`（同格式日档、原子写、按日读写、幂等、可移除）。
- 工具：`runtime/tools.mjs`，preset 作用域注册
  `memory_write/search/read/recall/update/forget/link/anchor/fs/pending/promote` + `remember/forget`；
  全部走闸门或只读。
- 复检与提升：`runtime/review.mjs`。`promotePending` 补齐后重新过闸 → 日档（`gate:promoted`、`source_ref`）；
  `runMonthlyReview` 复用引擎 `monthlyAudit`（写年轮、幂等）+ `rollCalendars` + 本插件五育统计
  （无源率、孤岛率、握命推进、天性高低级比）；`runYearlyReview` 给全年与待定清单。
- 新卷：`runtime/volume.mjs`。`元/卷.json` 只增不改；开卷时把 `persona/chat.md`、`persona/work.md`、
  `philosophy/wuyu.md` 快照进 `元/卷/<id>/persona/` 并记录 sha256 指纹；**只由人调用，不暴露成工具**。
- 测试：新增 `tests/wuyu.test.mjs`（4）、`tests/tools.test.mjs`（4）、`tests/review.test.mjs`（4）、
  `tests/volume.test.mjs`（1），全量 **146 项**通过。
- 已知未做：夜梦调度与六阶段、思源镜像/快照默认开、称呼/形态/风格/世界书轨道、`/cyrene` 命令与 doctor。

## 9. 第 3b 步（四条上下文轨道）实际执行结果（2026-10-22）

- 称呼：`runtime/nickname.mjs`。存储改为 `<root>/元/nickname.json`；旧 `dsha-brand-rename.json` 只在
  自家存储无值时**只读**兼容。通道：`user_nickname` 变量 + context order 120 + `set_nickname` 工具 +
  pre-step 显式改口解析。
- 形态/场景：`runtime/scene.mjs`（从退役插件迁入，纯内存状态）。context order 125 + `set_form` +
  pre-step 场景切换标记。
- 风格：`runtime/style.mjs`（迁入；状态写 `<root>/元/style.json`，自定义档 `<root>/元/style-custom.md`）。
  context order 130 + `/style` 命令 + `agent/request` 温度；`disabledPresets` 仍含 `cyrene-work`。
- 世界书：`runtime/worldbook/`（数据 + parse/match/assemble 已随仓库）。配置读取改为
  `<root>/元/worldbook.json`（旧 `~/.dsh/cyrene-worldbook.json` 只读兼容），支持行配置覆盖；
  context order 140 + pre-step 命中。
- 模式矩阵：`modes/*.mode.mjs` 的 `cyrene-runtime` 行带 `config.rails`；聊天四轨全开，
  工作只留世界书。构建器把 config 原样传入声明。
- 测试：`tests/rails.test.mjs` 5 项（四条轨道 + 模式矩阵），全量 **151 项**通过；
  PyYAML 校验 + 声明 round-trip 仍通过。
- 已知未做（第 4b）：夜梦六阶段调度、思源镜像/每日快照默认开、`/cyrene doctor` 与命令。

## 10. 第 5 步（漂移治理）实际执行结果（2026-10-22）

- `host/drift.mjs`：`loadSnapshot` / `snapshotIds` / `idsFromDocument` / `checkPresetDrift` / `checkDrift`。
  读运行时内置预设（`agentPresets.readDocument('standard'|'cordis')`），扫描行首 `- id:` 取行 id 集合，
  与 `modes/base/*.plugins.json` 的扁平 id 对比；缺行/多行/读取失败都算漂移。
  只比 id（配置差异由升级时重新快照负责），块标量正文不会误命中。
- 宿主：`host/index.mjs` 在 `provide('cyreneMemory')` 后 `ctx.inject(['agentPresets'])` 跑一次检测；
  结果写进 `service.diagnostics.drift`，不阻断；漂移时日志给出缺失/多余行并提示更新快照重构建。
- 测试：`tests/drift.test.mjs` 4 项（id 提取、单预设对比、双 base 对比、宿主 diagnostics 写入）；
  `tests/build.test.mjs` 增加「cyrene 运行时模块不得注册 prompt section」的 sealed 结构断言。
  全量 **156 项**通过。
- 已知未做（第 5b/6）：真机 profile 的 sealed 实测（需要安装到 profile）、`/cyrene doctor` 展示漂移、
  版本矩阵与发布。

## 11. 第 4b 步（夜梦 + 定时维护）实际执行结果（2026-10-22）

- 夜梦：`host/dream.mjs`。昔涟会话首次出现时用 DSH `schedule` 服务挂每日 `23:30` 任务
  （`config.dream`，默认开）；标记消息（`[cyrene-dream]`）到达时在 `agent/pre-step` 里把
  `memory/dream.js` 的六阶段规程注入标记之后；`turn/end` 收尾：标日档 dreamed、兜底梦志、
  释放租约、按需快照。租约/去重/force 语义沿用一页永恒。
- 定时维护：`host/maintenance.mjs`。默认 30 分钟 tick：思源镜像（锚点 + 近 3 天条目 +
  近 7 天梦志 + 余页）、每日快照（`snapshotHour` 后、保留 7 份）、月度体检与月年滚动。
  思源默认开（`SIYUAN_DEFAULTS.enabled = true`，本地 `127.0.0.1:6806` / `93-昔涟`，
  token 走 `SIYUAN_API_TOKEN`）；不可达时只写日志，不阻塞会话。定时器 `unref()`，
  不阻止进程退出。
- 测试：`tests/dream.test.mjs`（3：挂任务+注入+收尾、非昔涟跳过、schedule 缺失 fail-open）、
  `tests/maintenance.test.mjs`（2：快照/体检可跑、备份关闭跳过）。全量 **161 项**通过。
- 已知未做（第 6 步）：`/cyrene doctor`、`/memory` `/dream` 命令、迁移演练、Windows/两版 DSH 矩阵、发布。

## 12. 第 6 步（治理收尾）实际执行结果（2026-10-22）

- 命令（preset 作用域）：`runtime/commands.mjs` 注册 `/cyrene doctor`（根目录、persona 指纹、轨道与预算、
  记忆/待定、漂移、夜梦、维护/思源状态）、`/memory`（四问锚点 + 五育统计 + 最近条目）、
  `/dream`（手动触发六阶段整理）。
- 迁移演练：`scripts/import.mjs` 重构为可导入的 `runImport(options)`（CLI 仅做参数包装）；
  `tests/migration.test.mjs` 用合成数据验证：首次导入 3 条 / 复制 1 个旧日档 / 写卷与迁移报告 /
  重跑 0 新增 3 重复 / 源数据一字不动 / dry-run 不落盘。
- 版本与发布：`tests/version.test.mjs` 校验 package.json（含 `dsh.version`）、
  `dsh.plugin.json`、`plugin.json` 三处同版本且 CHANGELOG 有条目；新增 `CHANGELOG.md`（0.1.0）。
- CI：`.github/workflows/test.yml`，ubuntu + windows 矩阵跑 `npm test` / `harness:check` /
  `check` / `import.mjs --dry-run`（无第三方依赖，不需要 `npm install`）。
- 全量测试 **167 项**通过；`npm run check` 生成一致。
- 已知边界：未在真机 profile 安装（会与旧插件 preset id 冲突，安装前必须先卸载旧插件）；
  sealed 下 DSH 未来新增的 prompt section 靠 drift + doctor 告警，不自动恢复。

## 13. 截面镜像（sealed 语义兜底，2026-10-22 补）

- 背景：`complete: true` 的「只留 persona」发生在 `assemble()` 的 waterfall **之后**
  （dsh-system-prompt 0.2.1-rc.2：line 398 跑 `system-prompt/assemble`，line 403 才做 complete 恢复），
  而 `contexts` 在 sealed 下不被过滤。因此可以在装配监听器里拿到将被吞掉的全部 section。
- `runtime/section-mirror.mjs`：监听 `system-prompt/assemble`，`await next()` 后把 section 全文
  合成一条 `{name:'cyrene:section-mirror', text, interpolate:false}` context 追加到尾部。
  - `deployment:persona-prefix` / `persona-suffix` 与人设正文永不镜像；
  - `tool:*` / `plan:*` 自动镜像；未知名字默认镜像（命中 persona/identity/system/brand 跳过）；
  - `mode: auto|off|allowlist`、`maxChars`（默认 3000）、`mirrorUnknown` 可配；
  - 每次装配的镜像/跳过清单写进 `service.diagnostics.sections`，`/cyrene doctor` 新增「截面」一行。
- 配置：`modes/*.mode.mjs` 的 `cyrene-runtime` 行 `config.sectionMirror`；契约见 `docs/CONTRACT.md` §4.1。
- 测试：`tests/section-mirror.test.mjs` 5 项（自动/关闭/白名单/预算/persona 识别）；
  `tests/commands.test.mjs` 增加 doctor 截面断言。全量 **172 项**通过；YAML round-trip 仍通过。
- 真机待验：装配监听器在 preset/agent scope 下是否触发（源码路径确认，但无法在沙箱安装验证）。
  若未触发，doctor 会显示「未观测到装配」，此时退回 drift 告警 + 静态扫描。

## 14. 实机反馈修复（2026-10-22，装进桌面 profile 后）

实机（desktop profile，v0.1.0）反馈五条，已修：

1. **`/cyrene doctor` 被当普通消息**：命令原先注册在 `cyrene-runtime` 的嵌套
   `inject(['systemPrompt','cyreneMemory'])` 里（二级 inject + `commands`），实测不生效。
   改为**独立预设行** `cyrene-commands`（`dsh-cyrene-philia093-0/runtime/commands`，
   `inject: ['commands','cyreneMemory']`），与 `plan-mode` 同一种组合方式；注册结果写
   `元/命令诊断.log`。runtime 不再安装命令。
2. **`元/卷.json` 的 persona_hash 空串**：迁移脚本建卷时写空；新增 `memory/persona.js`
   （`personaHash` / `readVolumeState` / `ensureVolumePersonaHash`），import 建卷写指纹、
   宿主启动补章；`runtime/volume.mjs` 复用同一实现。
3. **三条夜梦日程里两条是死会话**：`installDream` 启动时 `pruneSchedules`——保留
   `lastCyreneSessionId` 与 `sessions.list()` 里的活会话，其余用 `schedule.delete` 清掉；
   `ensureSchedule` 也顺手 prune。`schedule.update` 返回 `updated !== true` 时记
   `update failed code=…` 并删除重建（旧日志的 `code=unknown` 来自迁移带过来的旧插件日志）。
4. **迁移报告像没搬成**：报告改为「当前数据：N 天日档 / M 条记忆 + 本次复制/导入 + 幂等说明」，
   明确 0 新增不是失败。
5. **体 = 0**：数据现状，不是缺陷；五育归属由写入方决定，不自动编造。

验证：全量 **175 项测试**通过；`npm run check` 一致；YAML round-trip 通过。命令修复需重启桌面端后
用 `/cyrene doctor` 与 `元/命令诊断.log` 复验；若日志无 `apply: commands=function`，则行未挂载。
