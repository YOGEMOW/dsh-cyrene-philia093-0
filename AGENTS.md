# AGENTS.md — 在本仓库里动手的规则

给后续开发者（人或 agent）的硬规则。详细方案见 `docs/ARCHITECTURE.md`，契约见 `docs/CONTRACT.md`。

## 1. 仓库边界

- 本仓库是**纯 Bundle 插件**：不引入任何第三方 npm 运行时依赖；可用 Harness 随安装包提供的库。
- **不得修改**两个退役插件：
  - `E:/Git/repositoris/DSH-Cyrene`（`dsh-cyrene` 0.6.3）
  - `E:/DSH-workspace/cyrene-eternal-page-remembrance`（0.5.4）
  它们只读，见 `docs/BASELINE.md`。
- 本插件与旧插件**不共存**：同一 `DSH_HOME` 只能有一个昔涟记忆引擎。

## 2. 人设是数据，不是代码

- `persona/` 下的 `.md` 是唯一真源；上游人设文本**逐字保留**，只做文件重组与拼装。
- 不得在 persona 正文里写未注册的 `{{...}}`（装配期直接抛错）。
- 改人格 = 开新卷：更新 `元/卷.json` 与 persona 指纹，跑装配契约测试与 20 条场景 A/B。
- `philosophy/wuyu.md` 是五育 canonical 文本，改动同样走新卷。

## 3. 预设声明是生成物

- 不要手改 `cordis.patch.yml`：它由 `scripts/build.mjs` 从 `modes/` + `persona/` + 内置 base 生成。
- 改完源文件必须 `npm run build`；`npm run check` 校验生成结果与源一致。
- 能力行来自**安装的 DSH** 的 `presets/standard.patch.yml` / `presets/cordis.patch.yml`，不手抄。

## 4. 两个模式都是 sealed

- 系统提示词只有 persona 前缀；任何“能力说明”只能走 `context` / `variable` / `pre-step` 三条通道（见契约第 4 节）。
- 不要为了“加一句提示”去挂 prompt section——sealed 下无效，且会误导后来者。
- 计划模式靠 `runtime/plan-bridge.mjs` 桥接；不要绕开 `planning` 隔离组。

## 5. 五育闸门

- 写入日档必须过硬门槛（溯源 / 五育归属 / 决策类后果 / 基座只读）。
- 未通过者进 `余页/待定/`，月检/年检复检后可提升；余页自由写作不被改动。
- `base: true` 的条目只能由人改，任何工具都不得写入。

## 6. 测试

```bash
npm test          # node --test "tests/*.test.mjs"
npm run harness:check
npm run check     # 生成一致性
```

- 不允许只跑改动的那一个测试文件。
- Windows 必须进 CI 矩阵（路径、CRLF、原子写、锁）。
- 人设类改动必须附 A/B 人设一致性结果。

## 7. 数据与隐私

- 记忆是明文 Markdown（设计如此，人可以手改），但必须是 0600 权限、原子写。
- 测试只用 `tests/fixtures/baseline/` 的**合成样例**，不得读取或提交真实用户记忆。
- 思源镜像默认开、fail-open；任何外部依赖失败不得阻塞会话。
