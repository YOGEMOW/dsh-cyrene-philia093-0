# v0.2.0 — 开新卷入口 · README/技术文档

发布日期：2026-10-23

自 v0.1.0 起的增量：以文档与「开新卷」入口为主，不改记忆格式、不迁移数据。

## 新增

- **开新卷入口**：
  - `node scripts/new-volume.mjs --dry-run` 预览；
  - `node scripts/new-volume.mjs --reason "…" --confirm new-volume` 执行；
  - 会话内：`/cyrene new-volume confirm <原因>`。
  - 开卷只记录卷号/时间/原因/persona 指纹，并把当前 persona 与五育 canonical 快照到
    `元/卷/<N>/persona/`；**不自动改人设文本**，改文本仍需编辑 `persona/` → `npm run build` → 重启。
- **README 重写**：改为昔涟口吻的通俗介绍，补「什么时候该开新卷」的硬触发、不要开的情况、
  5 个判断问题与例子表；技术内容收进末尾摘要。
- **docs/TECHNICAL.md**：给 AI/开发者的技术地图（目录职责、组合、存储、五育、夜梦、思源、
  构建测试、9 条不变量、已知边界）。
- 修正旧插件仓库链接为 `YOGEMOW/DSH-Cyrene` 与 `YOGEMOW/dsh-cyrene-eternal-page-remembrance`。

## 升级方式

无需迁移记忆；拉取新版本后重新 `dsh plugin add`（或重启 DSH）即可。版本号三处同步为 `0.2.0`。

## 验证

- 192 项测试通过；`npm run check` 生成一致；Windows + Linux CI 矩阵。
- `v0.1.0` 的发布说明保留在 `docs/RELEASE-v0.1.0.md`。
