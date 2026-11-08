# v0.6.4 — 修复思源文档每 3 秒被重建

发布日期：2026-11-08

「93-昔涟」里月响/年轮/锚点历史文档每隔几秒被删除重建，根因是镜像状态读取不完整：

- `loadMirrorState` 没有读回 `archives` 与 `anchorHistory`；
- 因此每次镜像都认为 3 篇月/年档和锚点历史是“未同步”；
- 写入后这两组状态又被下一次 `loadMirrorState` 丢掉，下一轮继续删了重建；
- `debounced flush(tool/result)` 约每几秒触发一次镜像，所以看起来就是每 3 秒建/删文档。

## 修复

- `loadMirrorState` 现在读回并保留 `archives`、`anchorHistory`（空状态也包含这两个对象）；
- 新增回归测试：保存后重新加载不会丢这两组状态；
- 镜像任务增加**并发合并**：debounced flush 与 30 分钟 tick 同时到达时复用同一个进行中的镜像，
  避免两个任务互相覆盖镜像状态。

## 验证

- 211 项测试通过；`npm run harness:check`、`npm run check` 通过。
- 手动按新版逻辑跑两遍：第一遍补齐 3 篇归档，第二遍 `synced=0, skipped=3`，不再重建。

## 升级

拉取后重启 DSH。重启后旧进程停止写入，新进程会保留归档状态，文档树不再闪烁。
