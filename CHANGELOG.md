# Changelog

本项目的版本迭代记录。格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)；
每个版本独立成节，不覆盖历史。语义化版本号（SemVer）。

Version history of this project. Each release is its own section — history is
never overwritten. Semantic versioning.

## [3.0.0-test] — 2026-08-16

### 新增（Added）

- **内嵌 AI 助手小窗口**：归档面板底部新增可折叠的 AI 对话窗，直接通过 DSH 官方 `session.create` / `session.prompt` / `session.history` API 驱动真实 agent 会话（默认 `standard` 标准模式，可在设置中改为其他 agent preset）
- **归档会话标签**：用户可在每个会话行上添加/删除自定义标签；标签由 host 半区持久化到 DSH profile 目录的 JSON 文件，并通过 `/api/archive-viewer/tags` 本地 HTTP API 读写
- **agent 标签协作**：AI 助手会在首条消息中携带标签 API 地址与归档会话清单，agent 可用 `curl` 调同一 API 给会话加/删标签
- **隐藏临时检索标签「agent检索」**：agent 检索命中后自动给会话添加隐藏标签，面板自动切换到「Agent 检索」筛选；该标签不显示在会话徽章上，用户取消勾选后自动清除
- **标签筛选菜单**：所有标签收纳进工具栏「筛选」按钮内的菜单，支持多选、AND / OR 模式，并可在菜单内搜索标签；与关键词搜索、排序叠加生效
- **AI 消息折叠**：AI 对话中的代码块与超长文本自动折叠为可展开区域，避免大量非自然语言内容刷屏
- **AI 模型与思考强度**：设置中可选择 AI 助手使用的模型、Provider 与思考强度（reasoning effort），留空则使用会话默认
- **AI 工作区**：设置中可指定 AI 助手会话的工作目录，默认 `E:\dsh-ai-workspace`
- **AI 会话隐藏与清理**：AI 助手会话自动归档为内部 helper 会话，不出现在侧边栏，也不会出现在归档面板；「新对话」会安全删除上一个 helper 会话（仅删除本插件登记过的会话，不会误删用户归档/普通会话）
- **AI 会话复用**：AI 助手会话 id 保存在 localStorage，关闭面板再打开会复用同一会话（模式匹配时），避免反复新建 DSH 会话；「新对话」可随时重置

### 修复（Fixed）

- 取消「Agent 检索」筛选时，隐藏标签现在会乐观清除并暂停周期刷新，避免旧标签回灌导致筛选没有及时关闭
- 修复 `ctx.effect` 未返回组合 disposer 导致部分路由注册后立即被注销的问题

### 变更（Changed）

- 设置面板新增「AI 模式」：可从已安装 agent preset 中选择（或手动输入 preset id），默认 `standard`
- 设置项新增标签筛选模式（AND / OR），默认 OR
- host 半区从“仅占位”升级为提供标签存储与 HTTP API；需要重启 `dsh web` 后生效

### Added (English)

- **Embedded AI assistant window**: collapsible chat at the bottom of the archive panel, powered by real DSH sessions through official `session.create` / `session.prompt` / `session.history` APIs (default `standard` preset, configurable in Settings)
- **Archived-session tags**: users can add/remove custom tags per row; tags are persisted by the host half in a JSON file under the DSH profile and exposed through the `/api/archive-viewer/tags` local HTTP API
- **Agent tag collaboration**: the AI assistant sends the tag API URL and archived session list in its first message, so the agent can use `curl` to add/remove tags
- **Hidden temporary search tag "agent检索"**: the agent tags matching sessions with a hidden tag, the panel automatically switches to the "Agent search" filter; the tag is not shown on session badges and is cleared when the user unchecks it
- **Tag filter menu**: all tags are collected inside a toolbar "Filter" button menu with multi-select, AND / OR mode, and tag search; combined with keyword search and sorting
- **AI message folding**: code blocks and very long text in AI replies are automatically collapsed into expandable sections
- **AI model & reasoning effort**: Settings can choose the AI assistant's model, provider, and reasoning effort (empty = session default)
- **AI workspace**: Settings can set the working directory for AI assistant sessions; default is `E:\dsh-ai-workspace`
- **AI session hiding & cleanup**: AI helper sessions are archived automatically as internal helper sessions, so they do not appear in the sidebar or archive panel; "New chat" safely deletes the previous helper session (only sessions registered by this plugin, never user sessions)
- **AI session reuse**: the AI helper session id is kept in localStorage and reused across panel opens (when the mode matches), reducing session clutter; "New chat" resets it

### Fixed (English)

- Unchecking "Agent search" now optimistically clears hidden tags and pauses periodic refresh, preventing stale tags from re-enabling the filter
- Fixed `ctx.effect` not returning a combined disposer, which caused some routes to be disposed immediately after registration

### Changed (English)

- Settings gained "AI mode": choose from installed agent presets (or type a preset id), default `standard`
- New tag-filter mode setting (AND / OR), default OR
- The host half now stores tags and serves a local HTTP API; restart `dsh web` to activate

## [2.0.0] — 2026-08-14

### 新增（Added）

- **关键词搜索**：搜索框输入即筛，匹配会话标题 / 会话 ID / 所属工作区（不区分大小写，250ms 防抖）
- **对话内容搜索**：搜索框内「内容」开关开启后，逐页扫描每段归档会话最近的对话（每会话扫描页数可在设置调整，默认 5 页），扫描进度实时显示，命中会话标注「内容命中 N 条」；关键词变化自动作废缓存并重扫
- **排序**：按最近更新 / 名称 / 会话 ID 排序，升序 / 降序一键切换（默认保持「最近更新 · 降序」的原有行为）
- **排列方式**：竖列列表 / 横排网格（工具栏分段按钮切换）；网格下展开的对话横跨整行
- **可关闭的介绍文本**：面板顶部说明带关闭按钮，关闭后可在设置里重新开启
- **设置界面**（面板右上角齿轮）：语言（跟随系统 / 中文 / English）、排序方式与方向、排列方式、内容搜索开关与扫描页数、介绍文本显隐、恢复默认；全部即时持久化到浏览器 localStorage（`dsh-archive-viewer:settings:v1`），跨刷新生效
- **中英双语**：全部界面文案（面板、入口、设置、确认框、错误提示）走 zh/en 字典，默认跟随浏览器语言，设置里可手动覆盖；侧边栏入口与「关闭 dsh」按钮标签同样跟随语言偏好

### 修复（Fixed）

- 日志读取 / 取消归档 / 关闭 dsh 的错误提示不再硬编码中文，随当前语言显示（英文界面下不再出现中文错误文案）
- 无 RPC message 时的兜底文案统一走当前语言的「未知错误」

### 变更（Changed）

- 版本号 0.1.4 → 2.0.0；README 中英双语文档同步更新

### Added (English)

- **Keyword search**: instant filtering by title / session ID / workspace (case-insensitive, 250 ms debounce)
- **Content search**: toggle "Content" in the search box to scan each archived session's recent messages page by page (pages per session configurable, 5 by default), with live progress and per-row hit counts; caches invalidate automatically when the keyword changes
- **Sorting**: by last updated / name / session ID, ascending or descending (default keeps the previous "last updated · desc" behavior)
- **Layout**: vertical list or horizontal grid via toolbar toggle; expanded conversations span the full row in grid mode
- **Dismissible intro note**: the panel description can be closed and re-enabled in Settings
- **Settings panel** (gear icon, top-right): language (system / 中文 / English), sorting key and direction, layout, content-search toggle and scan pages, intro-note visibility, reset defaults — all persisted instantly to localStorage (`dsh-archive-viewer:settings:v1`)
- **Bilingual UI**: every surface (panel, entry, settings, confirm dialogs, error messages) runs through the zh/en dictionary, following the browser language by default with a manual override

### Fixed (English)

- Error messages for log reading / unarchive / shutdown no longer hardcode Chinese; they follow the current UI language
- The fallback for RPC errors without a message now uses the current language's "Unknown error"

## [0.1.4] — 2026-08-14

### 新增（Added）

- 初始版本：侧边栏插件栏「已归档会话」入口，列出全部归档会话（标题、最后活跃时间、所属工作区、运行中/空白状态）
- 查看对话（`session.history` 分页读取）、下载日志 ZIP（`session.export`）、恢复会话（`workspace.unarchiveSession`）、复制会话 ID
- 会话头部右上角「关闭 dsh」按钮（`host.shutdown` 优雅关机）
- 皮肤全适配：全部样式使用 `--dsw-alias-*` 设计令牌，面板 Portal 到 `document.body`

### Added (English)

- Initial release: sidebar entry listing all archived sessions (title, last activity, workspace, running/blank state)
- Read conversations (`session.history` with paging), download log ZIP (`session.export`), restore/unarchive (`workspace.unarchiveSession`), copy session ID
- "Shut down dsh" button in the conversation header (`host.shutdown` graceful teardown)
- Skin-adaptive styling via `--dsw-alias-*` design tokens; panel portaled to `document.body`

[2.0.0]: https://github.com/keepermttl/dsh-archive-viewer/releases/tag/v2.0
[0.1.4]: https://github.com/keepermttl/dsh-archive-viewer/commit/41998c0
