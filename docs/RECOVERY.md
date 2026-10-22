# 记忆丢失时的恢复手册

> 原则：**先停 DSH，再动文件**。宿主运行时会持续写 `元/`，热改容易把恢复结果覆盖掉。
> 恢复顺序：**本地快照 → 思源副本 → 退役插件迁移备份**。优先本地快照（最完整，含余页）。

## 0. 先停掉 DSH

从托盘完全退出 DeepSeek Harness。确认进程结束后再操作以下文件：

```
%USERPROFILE%\.dsh\cyrene-philia093-0\                      # 记忆根
%USERPROFILE%\.dsh\cyrene-philia093-0-snapshots\           # 每日快照（保留 7 份）
```

## 1. 首选：本地快照恢复（含余页，最完整）

快照是 `元/`、`日/`、`锚/`、`梦/`、`月/`、`年/`、`余页/` 的整目录拷贝，每天 3 点后一次。

```pwsh
$dsh = "$env:USERPROFILE\.dsh"
Get-ChildItem "$dsh\cyrene-philia093-0-snapshots" | Sort-Object Name -Descending | Select-Object -First 7 Name, LastWriteTime

# 把坏掉的根目录改名留档（不要直接删）
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Rename-Item "$dsh\cyrene-philia093-0" "cyrene-philia093-0.broken-$stamp"

# 选一份日期最近的快照复制回来
Copy-Item "$dsh\cyrene-philia093-0-snapshots\2026-10-22" "$dsh\cyrene-philia093-0" -Recurse
```

恢复后启动 DSH，用 `/cyrene doctor` 与 `/memory` 核对条目数、五育分布、锚点。

## 2. 思源副本恢复（跨机器 / 快照也没有时）

### 前置条件

- 思源桌面端在运行，地址默认 `http://127.0.0.1:6806`；
- 环境变量里有 API token：`SIYUAN_API_TOKEN`（没设就先 `setx SIYUAN_API_TOKEN "..."` 并重开终端）；
- 笔记本名默认 `93-昔涟`，根路径默认 `/一页永恒`（可在 `元/settings.json` 或面板里改）。

### 先演练（不碰真实数据）

```pwsh
cd E:\DSH-workspace\dsh-cyrene-philia093-0
node scripts/restore-siyuan.mjs --dry-run
```

`--dry-run` 会把当前根复制到临时目录、在副本上跑完整恢复并输出报表，然后丢弃副本。

### 正式恢复

```pwsh
node scripts/restore-siyuan.mjs
```

默认 **missing-only**：按正文 hash 只补本地缺失的条目；锚点/梦志只在本地为空或还是占位时写入。
**不会覆盖已有记忆。**

需要覆盖锚点/梦志（例如本地锚点已被写坏）：

```pwsh
node scripts/restore-siyuan.mjs --force --yes
```

条目仍按 hash 去重，不会重复；`--yes` 是覆盖确认闸。

### DSH 正在运行时（root 还能读）

- 命令：`/cyrene restore`（只补缺失；`/cyrene restore force` 覆盖锚点/梦志）
- 面板：设置 →「昔涟 · 一页永恒」→「从思源恢复」

## 3. 从退役插件的迁移备份恢复

安装新插件时若做过备份，`~/.dsh\.migration-backup-<时间戳>\` 里有旧根目录。
把旧 `cyrene-eternal-page-remembrance\` 目录复制回 `~/.dsh\`，再跑一次
`node scripts/import.mjs`（幂等），或直接按上面的快照方式合并。

## 4. 思源里有什么、没有什么

| 内容 | 思源镜像 | 自动恢复 |
|---|---|---|
| 日档条目（四问/五育字段） | ✅ `/一页永恒/日/YYYY/MM/YYYY-MM-DD` | ✅（I 默认 4、S=1、kind=fact、src=restore） |
| 四问锚点 | ✅ `/一页永恒/锚/...` | ✅（默认只补空/占位） |
| 梦志 | ✅ `/一页永恒/梦/...` | ✅（默认只补缺失） |
| 余页自由写作 | ✅ 镜像为文档 | ❌ 不自动回灌（需从思源手工导出后放回 `余页/`） |
| 每月/每年卷、快照历史 | ❌ 不进思源 | 只能靠本地快照 |

## 5. 为什么可能“恢复不全”

- 思源里只有**曾经镜像成功**的内容。若某段时间思源没开 / token 失效，那段时间的新记忆只在本地；
- 新卷的定时镜像每 30 分钟同步「近 3 天」条目、锚点、近 7 天梦志、余页；更早的条目在**创建当天**
  就已镜像，之后的修改（更新/遗忘）会同步，但**从未同步过的旧条目不会凭空出现**；
- 因此：**本地每日快照才是第一道保险**；思源是跨机器/灾难副本。
- 恢复后如果条目时间对不上：恢复条目按「恢复当天」落档（正文与五育归属保留），原始时间不再精确。

## 6. 恢复后自检

1. `/cyrene doctor`：条目数、配额、思源状态、夜梦；
2. `/memory`：四问锚点与最近条目；
3. 抽一条旧事问一句，确认能回忆起来；
4. 若条目少了，再跑一次 `node scripts/restore-siyuan.mjs`（幂等）或换更早的本地快照。
