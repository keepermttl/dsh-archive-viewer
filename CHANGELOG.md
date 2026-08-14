# Changelog

本项目的版本迭代记录。格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)；
每个版本独立成节，不覆盖历史。语义化版本号（SemVer）。

Version history of this project. Each release is its own section — history is
never overwritten. Semantic versioning.

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
