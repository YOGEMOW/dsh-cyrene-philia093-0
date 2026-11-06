# v0.6.2 — 适配 DSH 0.2.2-rc.1

发布日期：2026-11-06

DSH 更新到 `0.2.2-rc.1` 后，命令注册校验变严：`input.hint` 不能为空。  
`/memory` 命令的 hint 原来是空字符串，导致启动时反复注册失败：

```
register failed memory: command "memory" input hint must not be empty
```

## 修复

- 给 `/memory` 补上 `input.hint`：`四问锚点｜五育统计｜最近记忆`；
- 新增回归断言：所有注册命令的 `input.hint` 必须是非空字符串；
- 其余命令（`/cyrene`、`/dream`）的 hint 本来就有值，不受影响。

## 验证

- 209 项测试通过；`/cyrene` 中文/英文命令测试通过。
- 启动日志中的 `register failed memory` 应消失。

## 升级

拉取后重启 DSH。DSH 更新后建议先打开 `/cyrene 帮助` 或 `/memory` 确认命令恢复。
