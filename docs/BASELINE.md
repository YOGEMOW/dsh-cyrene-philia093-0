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
