# 装坏了怎么办：卸载、退路与自检

> 先放一句安心的话：**卸载插件不会删掉记忆。**
> 记忆住在 `%USERPROFILE%\.dsh\cyrene-philia093-0`，不在插件目录里；插件只是一把钥匙，钥匙丢了，屋子还在。

## 0. 动手前的三十秒：把记忆复制走

任何操作之前，先做这一件最稳的事：

```pwsh
$dsh = "$env:USERPROFILE\.dsh"
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item "$dsh\cyrene-philia093-0" "$env:USERPROFILE\Desktop\cyrene-backup-$stamp" -Recurse
```

想连每日快照一起保：把 `cyrene-philia093-0-snapshots` 也复制一份。

## 1. 正常卸载（三分钟）

1. 从**托盘图标**完全退出 DeepSeek Harness（关窗口不算退出）。
2. 在终端里：

```pwsh
dsh plugin --profile desktop remove dsh-cyrene-philia093-0
```

3. 重开 DSH。新建对话的模式选择里，「昔涟聊天模式 / 德谬歌工作模式」应当消失。

核对是否真的卸掉了：

```pwsh
dsh plugin --profile desktop why dsh-cyrene-philia093-0   # 报 not found 就是卸干净了
```

## 2. 起不来（点了图标没反应 / 白屏 / 一直转）

按顺序试，**每一步都只需要上一步不管用才做**。

**① 先卸插件，再启动。**
绝大多数启动失败来自插件与宿主版本不匹配。先执行第 1 节的卸载命令，然后启动。
能起来 = 问题定位在插件，此时再核对版本要求（DSH `>= 0.2.1-rc.2`）装回去。

**② 卸载命令自己跑不动**（pnpm 报错、卡住）。
直接删掉 profile 里的那条链接——它是符号链接（`link:E:\...`），删它不会动到源码：

```pwsh
Remove-Item "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-cyrene-philia093-0" -Recurse -Force
```

**③ 还起不来。**
打开 `%USERPROFILE%\.dsh\profiles\desktop\package.json`（先复制一份备份），看两处：

| 位置 | 该删掉的内容 |
|---|---|
| `dependencies` | `"dsh-cyrene-philia093-0": "link:..."` |
| `dsh.profile.bundles` | 数组里的 `"dsh-cyrene-philia093-0"` 这一项 |

pnpm 的 `remove` 只清 `dependencies`，`bundles` 里那一项要自己删——**这一项残留，DSH 仍会尝试加载它。**

**④ 最坏情况：别格式化。**
换一个干净的 profile 启动即可，你的记忆、快照、思源副本都不在 profile 里，换 profile 碰不到它们。

```pwsh
dsh --profile <另一个profile名>
```

## 3. 和其它昔涟插件不能共存

同一个 `DSH_HOME` 只能有一个昔涟记忆引擎。下面三个插件**共用同一套模式 id**：

- `dsh-cyrene`（0.6.3，退役）
- `dsh-cyrene-eternal-page-remembrance`（0.5.4，退役）
- `dsh-cyrene-philia093-0`（本插件）

装本插件之前，先把前两个卸掉：

```pwsh
dsh plugin --profile desktop remove dsh-cyrene
dsh plugin --profile desktop remove dsh-cyrene-eternal-page-remembrance
```

同时装多个的典型症状：模式列表里出现重复的同名项、记忆写进不同目录、启动报 mode id 冲突。

## 4. 卸载之后，东西都在哪

| 内容 | 位置 | 卸载插件会怎样 |
|---|---|---|
| 记忆（锚/日/月/年/梦/余页/元） | `%USERPROFILE%\.dsh\cyrene-philia093-0\` | 不受影响 |
| 每日快照（保留 7 份） | `%USERPROFILE%\.dsh\cyrene-philia093-0-snapshots\` | 不受影响 |
| 思源镜像 | 思源笔记 `/一页永恒/` | 不受影响 |
| 迁移备份 | `%USERPROFILE%\.dsh\.migration-backup-<时间戳>\` | 不受影响 |
| 插件本体 | 你 `link:` 指向的那个仓库目录 | 只是取消链接，目录还在 |

**唯一能让记忆真的消失的做法**：手动删掉这两个目录（`cyrene-philia093-0` 与 `cyrene-philia093-0-snapshots`）。除此之外，卸载、换 profile、重装都不会动它。

## 5. 装回来

```pwsh
dsh plugin --profile desktop add "link:E:/DSH-workspace/dsh-cyrene-philia093-0"
```

重开 DSH → 新建对话时选「昔涟聊天模式」→ 发一句：

```
/cyrene doctor
```

能看到体检报告（住处、条目数、备份与夜梦状态），就说明接上了原来的记忆。条目数不对，走 [RECOVERY.md](RECOVERY.md)。

## 6. 出问题时，把这些一起贴出来

求人或提 issue 时，信息越全越快：

1. DSH 版本：`dsh --version`
2. 插件版本：仓库 `package.json` 里的 `version`
3. 报错**原文**（截图或复制，不要只说"报错了"）
4. 是否装过其它昔涟插件（旧插件残留是常见原因）
5. 卸载后能否启动——这一条能直接把问题劈成「插件问题」还是「环境问题」

## 7. 已知边界

- 本插件没有第三方运行时依赖，不需要 `npm install`；`link:` 安装指向本地仓库，删仓库目录会让插件失效（记忆不受影响）。
- 桌面端 profile 由 Electron 应用托管，不能用 `dsh --profile desktop --dump-config` 这类调试命令排障；排查请按上面第 2 节的卸载法做二分。
- 思源是可选件：思源没开、token 失效都只会在日志里记一笔，不会阻塞会话，也不会影响本地记忆。
