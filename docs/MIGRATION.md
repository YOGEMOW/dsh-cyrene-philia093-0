# MIGRATION — 从旧插件迁到新卷

> 适用：已安装 `dsh-cyrene` 0.6.3 与/或 `dsh-cyrene-eternal-page-remembrance` 0.5.4，要切到 `dsh-cyrene-philia093-0`。
> 原则：**备份 → 导入 → 卸载 → 安装 → 重启 → 校验**。任何一步失败都可回滚。

## 0. 迁移前备份

```pwsh
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bak = "$env:USERPROFILE\.dsh\.migration-backup-$stamp"
New-Item -ItemType Directory -Force $bak | Out-Null
Copy-Item "$env:USERPROFILE\.dsh\cyrene-memory.md" $bak -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.dsh\cyrene-memory.md.bak-*" $bak -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.dsh\cyrene-style.json" $bak -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.dsh\cyrene-style-custom.md" $bak -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.dsh\cyrene-nickname.json" $bak -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.dsh\cyrene-worldbook.json" $bak -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.dsh\dsha-brand-rename.json" $bak -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.dsh\cyrene-eternal-page-remembrance" $bak -Recurse -ErrorAction SilentlyContinue
```

## 1. 导入（新插件安装前先跑导入器）

```pwsh
node scripts/import.mjs --dry-run   # 先看会导入什么
node scripts/import.mjs             # 真正写入新卷根目录
```

导入映射：

| 旧数据 | 新位置 | 规则 |
|---|---|---|
| `cyrene-memory.md`（`- 内容` 行） | `日/<今天>.md` | 每条 → 一个 Entry：`kind: fact`、`src: import`、`src_ids: ["legacy:cyrene-memory.md#L<n>"]`、`axis` 按五育自检推断；幂等键 = 正文 hash |
| `cyrene-eternal-page-remembrance/` | 原样复制到新根 | 目录格式兼容（`元/`、`日/`、`月/`、`年/`、`梦/`、`余页/`）；`元/卷.json` 重建为卷 0 |
| `cyrene-style.json` | `元/style.json` | 档位按会话 id 保留 |
| `dsha-brand-rename.json` | `元/nickname.json` | 只读兼容读取，不再写回外部文件 |
| `cyrene-worldbook.json` | `元/worldbook.json` | 原样 |
| `cyrene-nickname.json` | `元/nickname.json` | 合并字段 |

导入器必须：幂等、不覆盖已有新数据、生成 `元/迁移报告.md`、失败不破坏源文件。

## 2. 卸载旧插件

```pwsh
dsh plugin --profile desktop remove dsh-cyrene
dsh plugin --profile desktop remove dsh-cyrene-eternal-page-remembrance
```

> 必须先卸：两者与新插件都有 `chat` / `cyrene-work` 预设 id，同时存在会导致注册表拒绝其中一份声明。

## 3. 安装新卷

```pwsh
dsh plugin --profile desktop add link:E:/DSH-workspace/dsh-cyrene-philia093-0
```

重启 DSH（预设声明是启动期注册）。

## 4. 校验

- 新建对话，模式选择器出现「昔涟聊天模式」「德谬歌工作模式」；
- `/cyrene doctor`：persona 指纹、注入预算、记忆条目数、迁移报告、夜梦/思源状态、漂移告警；
- 旧会话（preset id `chat` / `cyrene-work`）能恢复；
- 抽查记忆：`/memory` 看到四问锚点与条目统计。

## 5. 回滚

1. 卸载新卷；
2. 从第 0 步的备份目录恢复 `.dsh` 下文件；
3. 重装两个旧插件（版本与 commit 见 `docs/BASELINE.md`）；
4. 重启。

回滚不会删除新卷目录（`<DSH_HOME>/cyrene-philia093-0/`），可按需手动清理。
