# dsh-archive-viewer

Archived-session manager for the **DeepSeek Harness (DSH) Web GUI**: browse, read, and **restore archived sessions**, plus a one-click **shutdown button** in the header.

中文说明见 [README.md](README.md) · Changelog: [CHANGELOG.md](CHANGELOG.md)

## Features

- **Sidebar plugin-bar entry**: lists every archived session — title, last activity, workspace, running/blank state
- **Keyword search**: instant filtering by title / session ID / workspace (case-insensitive); toggle "Content" to also scan each session's recent messages page by page (pages per session configurable in Settings, with live progress)
- **Sorting**: by last updated / name / session ID, ascending or descending
- **Layout**: vertical list or horizontal grid (an expanded conversation spans the full row in grid mode)
- **Dismissible intro note**: the panel's description can be closed with one click and re-enabled in Settings
- **Settings panel** (gear icon, panel top-right): language, sorting, layout, content search, intro note visibility — all persisted instantly; "Reset defaults" restores everything
- **Bilingual UI (中文 / English)**: follows the browser language automatically, overridable in Settings
- **Read conversations**: loads the archived session log via `session.history` (cold sessions read through persistence inspection, no agent activation), with paging for older messages
- **Download log ZIP**: official `session.export` endpoint
- **Restore sessions (unarchive)**: one click puts the session back into its original workspace group, position preserved
- **Shutdown button** (header, top-right): graceful host shutdown (equivalent to Ctrl+C — 5s grace teardown)
- **Skin-adaptive**: all styling uses shell design tokens (`--dsw-alias-*`), following any skin; the panel is portaled to `document.body` to avoid sidebar-scoped token overrides

## Required DSH core patch (read first)

"Restore" and "Shutdown" depend on two new RPCs not yet in upstream DSH (as of 2026-08):

- `workspace.unarchiveSession`
- `host.shutdown`

Apply the patch before use:

```sh
cd <your deepseek-harness checkout>
git apply /path/to/dsh-archive-viewer/patches/0001-workspace-unarchive-and-host-shutdown-rpcs.patch
```

Then **restart `dsh web`** (source checkouts run via tsx — no build needed; packaged installs must rebuild the affected packages). The patch touches 8 files: the workspace registry, and the apiproxy interface/schemas/routes/implementation.

> If upstream DSH ever merges these RPCs (the `workspace.ts` comment "a future unarchive" marks exactly this spot), the patch becomes a no-op and can be skipped safely.

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

## Usage

1. Sidebar bottom (above Settings): open the archived-sessions panel
2. Type a keyword to filter instantly; hit "Content" to also search message content (pages per session configurable in Settings)
3. Toolbar: choose sort key (last updated / name / ID) and direction; list/grid buttons switch the layout
4. Gear icon opens Settings: language, sorting, layout, search, intro note, reset defaults
5. Per row: **Read conversation / Restore / Download ZIP / Copy ID**
6. Header top-right power button: confirm to shut down dsh

Settings (language, sorting, layout, search, intro note, …) are persisted in the browser's localStorage (`dsh-archive-viewer:settings:v1`) and survive refreshes and page reloads.

## Compatibility

- Developed and verified against a DSH `0.1.0-rc.5` source checkout
- Zero framework type dependencies: no `@deepseek-ai/*` value imports, structural types only — no drift with DSH SDK versions
- Build: `tsdown` (host half `lib/index.js` + browser half `lib/client.js`, standard `window.__ModuleLoader__.load` closure-factory format)

## License & usage statement

**MIT License** (see [LICENSE](LICENSE)).

Anyone is welcome to **use, modify, reference, or bundle this project into their own plugin collections** (e.g. a dsh-web-ui family repo), as long as you keep the `LICENSE` file / copyright notice and credit the source (this repository).

## Related

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- Plugin shape modeled after [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) (`dsh.bundle.patch` + `dsh.client` declaration + slot registration)
