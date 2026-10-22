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
