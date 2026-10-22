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

**第 1 步（记忆引擎迁入 + 等价性 + 迁移脚本）已完成。** 现在**仍不可安装**：预设声明与
runtime 轨道未接入，`cordis.patch.yml` 只有宿主半体骨架。

- `memory/`：一页永恒 0.5.4 的引擎已迁入（18 个模块），新增五育扩展字段（只写非空值，旧条目逐字兼容）；
- 等价性：旧引擎的 16 个测试文件全部迁入并通过（121 项），另加 4 项新卷扩展测试；
- `scripts/import.mjs`：旧 `cyrene-memory.md` + 一页永恒目录 → 新根目录，幂等（已实测两次运行第二次 0 导入）；
- 根目录解析改为**永不落 CWD**（空白 `DSH_HOME` 回落 `~/.dsh`）。

| 步 | 内容 | 状态 |
|---|---|---|
| 0 | 新仓、契约、基线、骨架 | ✅ |
| 1 | 记忆引擎迁入 + 等价性 + 迁移脚本 | ✅ |
| 2 | 人设资源化 + 构建器 + 装配契约测试 | ⏳ |
| 3 | runtime rails / 能力总则 / 计划桥 | ⏳ |
| 4 | 五育闸门 + 月年复检 + 新卷 | ⏳ |
| 5 | 双模式 sealed 全能力 + 漂移治理 | ⏳ |
| 6 | 治理收尾 / 文档 / 版本矩阵 / 发布 | ⏳ |

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
