# dsh-archive-viewer

Archived-session manager for the **DeepSeek Harness (DSH) Web GUI**: browse, read, and **restore archived sessions**, plus a one-click **shutdown button** in the header.

> Current version: **3.1.0** (works with DSH 0.1.2-rc.x — **no DSH core patch required**)

中文说明见 [README.md](README.md) · Changelog: [CHANGELOG.md](CHANGELOG.md)

## Features

- **Sidebar plugin-bar entry**: lists every archived session — title, last activity, workspace, running/blank state
- **Keyword search**: instant filtering by title / session ID / workspace (case-insensitive); toggle "Content" to also scan each session's recent messages page by page (pages per session configurable in Settings, with live progress)
- **Sorting + filtering**: sort by last updated / name / session ID, ascending or descending; tag filters live inside a toolbar "Filter" menu with multi-select, AND / OR mode, and tag search, combined with keyword search
- **Archived-session tags**: users can add/remove custom tags per session; tags are persisted under the DSH profile by the host half and exposed through a local HTTP API
- **Embedded AI assistant**: a collapsible chat at the bottom of the panel drives a real DSH agent (default `standard`, configurable to other presets) to search sessions, add tags, and organize archives; code blocks and long text in replies are collapsed automatically
- **AI helper sessions auto-hidden**: AI assistant sessions are archived automatically as internal helper sessions, so they do not appear in the sidebar or archive panel; "New chat" safely deletes the previous helper session and never touches user sessions
- **AI workspace**: AI assistant sessions are created under `E:\dsh-ai-workspace` by default; configurable in Settings
- **Hidden temporary search tag**: when the agent finds sessions, it tags them with a hidden "agent检索" tag and the panel automatically switches to the "Agent search" filter; the tag is not shown on session badges and is cleared when unchecking the filter
- **Layout**: vertical list or horizontal grid (an expanded conversation spans the full row in grid mode)
- **Dismissible intro note**: the panel's description can be closed with one click and re-enabled in Settings
- **Settings panel** (gear icon, panel top-right): language, sorting, layout, content search, AI mode, AI model & reasoning effort, AI workspace, tag-filter mode, intro note visibility — all persisted instantly; "Reset defaults" restores everything
- **Bilingual UI (中文 / English)**: follows the browser language automatically, overridable in Settings
- **Read conversations**: the host half reads the session log directly (`sessionPersistence.readRaw`, line-by-line parsing with no whole-log replay), with paging for older messages; cold and live sessions both read without agent activation, and multi-MB logs return in under a second
- **Download log ZIP**: official `session.export` endpoint
- **Restore sessions (unarchive)**: one click puts the session back into its original workspace group, position preserved (the plugin's host half writes the registry archive set — no upstream RPC needed)
- **Shutdown button** (header, top-right): graceful host shutdown (equivalent to Ctrl+C — 5s grace teardown)
- **Skin-adaptive**: all styling uses shell design tokens (`--dsw-alias-*`), following any skin; the panel is portaled to `document.body` to avoid sidebar-scoped token overrides

## Compatibility: adapted to current DSH (0.1.2-rc.x)

DSH's client/host APIs were reworked during 0.1.2 and no longer match 0.1.0-rc.x. This release rewires the plugin:

| Capability | Old wiring (broken) | Current wiring |
| --- | --- | --- |
| Read session log | client `connection.api.sessions.history` RPC | host route `/api/archive-viewer/history` (`sessionPersistence.readRaw` raw-JSONL fast path, falls back to `sessionQuery.readSession`) |
| Content search | client-side page-by-page RPC scan | host route `/api/archive-viewer/content-search` (one log read per session + counting) |
| Unarchive | `workspace.unarchiveSession` RPC from the core patch | host route `/api/archive-viewer/unarchive` (writes the registry archive set; `domain/changed` updates every client live) |
| Archive (hide AI helper sessions) | `workspace.archiveSession` RPC (dotted path) | host route `/api/archive-viewer/archive` (`workspaceRegistry.archiveSession`) |
| AI helper create/prompt/select-model/model catalog/preset list | `connection.api.*` | official unary RPC: client namespace services `ctx.get('remote.session')` / `remote.agentPresets` when present, otherwise the wire fallback `POST /api/<namespace>/<method>` with envelope `{type:'client-request',rpcId,method,payload:{args}}` |
| Shutdown | `host.shutdown` RPC from the core patch | host route `/api/host.shutdown` + the launcher's `appExit` host value (a missing value reports an error instead of stalling the plugin) |
| Client service deps | `inject: ['slots','sessions','workspaces','connection']` | `inject: ['slots','sessions','workspaces']` (and `dsh.client.inject` now lists packages that exist) |

> The plugin **no longer requires patching DSH source**: unarchive goes through the registry's own commit path, so a DSH upgrade cannot wipe it. The `patches/` directory is kept for history only — **do not apply it**.

## Install

Requirements: Node.js >= 22, pnpm.

```sh
git clone https://github.com/keepermttl/dsh-archive-viewer.git
cd dsh-archive-viewer
pnpm install
pnpm build

dsh plugin --profile web add link:$(pwd)      # POSIX
dsh plugin --profile web add link:E:\path\to\dsh-archive-viewer   # Windows
```

Restart `dsh web` and hard-refresh (Ctrl+F5).

> When upgrading from an older version, be sure to **restart `dsh web`**: this version adds four new host-side routes (history / content-search / archive / unarchive) — a browser refresh alone will not load host-side changes.

## Usage

1. Sidebar bottom (above Settings): open the archived-sessions panel
2. Type a keyword to filter instantly; hit "Content" to also search message content (pages per session configurable in Settings)
3. Toolbar: choose sort key (last updated / name / ID) and direction; list/grid buttons switch the layout; click "Filter" to open the tag-filter menu (multi-select, AND / OR, tag search, "Agent search")
4. Gear icon opens Settings: language, sorting, layout, search, AI mode, AI model & reasoning effort, tag-filter mode, intro note, reset defaults
5. Per row: **Read conversation / Restore / Download ZIP / Copy ID / Tags**
6. Use the **AI Assistant** window at the bottom to chat with a DSH agent directly — ask it to search sessions, add tags, or organize archives; the agent can operate tags through the tag API; code/long text is collapsed; AI sessions are auto-hidden and "New chat" deletes the previous AI session
7. Header top-right power button: confirm to shut down dsh

Settings (language, sorting, layout, search, AI mode, AI model & reasoning effort, tag-filter mode, …) are persisted in the browser's localStorage (`dsh-archive-viewer:settings:v1`) and survive refreshes and page reloads.

Tag data is persisted by the host half to `dsh-archive-viewer-tags.json` under the DSH profile directory and exposed through a local HTTP API:

- `GET /api/archive-viewer/tags` — read all tags
- `POST /api/archive-viewer/tags` — add/remove tags, e.g. `{"sessionId":"<id>","add":["tag"]}` / `{"sessionId":"<id>","remove":["tag"]}`
- `POST /api/archive-viewer/tags` — clear hidden search tags with `{"clearHidden":true}`

Other host-half routes (all accept loopback same-origin requests only: the Host header must be a loopback address, and a present Origin must match):

- `POST /api/archive-viewer/history` `{sessionId,beforeSeq?,maxMessages?}` → `{ok,events,hasMore,nextBeforeSeq}` — paged log (messages normalized as `data.text`)
- `POST /api/archive-viewer/content-search` `{sessionId,keyword,maxMessages?}` → `{ok,matches}` — per-session content hit count
- `POST /api/archive-viewer/unarchive` `{sessionId}` → `{ok,archivedSessionIds}`
- `POST /api/archive-viewer/archive` `{sessionId}` → `{ok,archivedSessionIds}`
- `POST /api/archive-viewer/helper-sessions` `{sessionId,action:'add'|'remove'}` — register/unregister an AI helper session
- `POST /api/archive-viewer/session/delete` `{sessionId}` — delete a registered AI helper session (every other session is refused)
- `POST /api/host.shutdown` (client-request envelope) — graceful shutdown

## Compatibility

- Developed and verified item by item against a DSH **0.1.2-rc.1** source checkout (panel list / read conversation / content search / restore / archive↔unarchive round-trip / AI helper session creation and replies / settings preset and model catalog / helper session deletion)
- **No DSH source changes required**; the legacy patch under `patches/` is kept for history only
- Zero framework type dependencies: no `@deepseek-ai/*` value imports, structural types only — no drift with DSH SDK versions
- Build: `tsdown` (host half `lib/index.js` + browser half `lib/client.js`, standard `window.__ModuleLoader__.load` closure-factory format)

## License & usage statement

**MIT License** (see [LICENSE](LICENSE)).

Anyone is welcome to **use, modify, reference, or bundle this project into their own plugin collections** (e.g. a dsh-web-ui family repo), as long as you keep the `LICENSE` file / copyright notice and credit the source (this repository).

## Related

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- Plugin shape modeled after [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) (`dsh.bundle.patch` + `dsh.client` declaration + slot registration)
