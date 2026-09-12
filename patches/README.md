# patches/ — 仅作历史留存（不再需要）

`0001-workspace-unarchive-and-host-shutdown-rpcs.patch` 是 **3.0.0 时代**的产物：
当时「恢复会话」与「关闭 dsh」依赖 DSH 核心新增两个 RPC（`workspace.unarchiveSession`、
`host.shutdown`），只能靠改 DSH 源码实现。

自 **3.1.0** 起，两条能力都由插件自己提供：

- 恢复会话：宿主半区 `/api/archive-viewer/unarchive` 写注册表归档集合（优先调用注册表
  自身的 `unarchiveSession`；否则读回其状态对象、只改 `archivedSessionIds` 并经其
  `setState` 提交），写入触发 `domain/changed`，所有客户端实时更新。
- 关闭 dsh：宿主半区 `/api/host.shutdown` + launcher 提供的 `appExit` 宿主值。

因此：

- **不要应用此补丁**（DSH 0.1.2 起该文件已无法应用，路径 `packages/host/apiproxy/*`
  在新版中已被 `packages/api/*` + `packages/client/connection/*` 取代）。
- 保留它只是为了保留历史上下文；升级 DSH 也不会再把它冲掉，因为插件不再依赖它。
