/**
 * dsh-archive-viewer 注入样式。
 * 全部使用 shell 的设计令牌（--dsw-alias-* / --dsh-*）：皮肤（skin）就是重定义
 * 这些变量，因此本插件自动跟随当前皮肤，无需逐皮肤适配。几何与交互样式参照
 * 官方 ui-cordis 的 CordisPanel.module.css（同为 sidebar.footer.action 注册项）。
 */

export const CSS_TEXT = `
/* ── 侧边栏插件栏入口（sidebar.footer.action 列表项） ── */
[data-dsh-archive-viewer-layer] {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  width: 100%;
  height: 49px;
  margin: 8px 0 0;
}
[data-dsh-archive-viewer-layer][data-rail="true"] {
  width: 36px;
  height: 36px;
  margin: 0;
}
[data-dsh-archive-viewer-footer] {
  display: flex;
  align-items: center;
  width: 100%;
}
[data-dsh-archive-viewer-layer][data-rail="true"] [data-dsh-archive-viewer-footer] {
  flex-direction: column;
  gap: 2px;
}
[data-dsh-archive-viewer-badge] {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 49px;
  padding: 0 8px 0 6px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  overflow: hidden;
}
[data-dsh-archive-viewer-badge]:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-dsh-archive-viewer-badge][data-active="true"] {
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-dsh-archive-viewer-layer][data-rail="true"] [data-dsh-archive-viewer-badge] {
  justify-content: center;
  gap: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;
}
[data-dsh-archive-viewer-badge-label] {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 面板（fixed 层叠，锚在侧边栏上方；几何参照 CordisPanel） ── */
[data-dsh-archive-viewer-panel] {
  position: fixed;
  left: 12px;
  bottom: 128px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: 560px;
  max-width: calc(100vw - 24px);
  max-height: 72vh;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  /* 浮动层必须用 overlay 令牌：皮肤的 bg-base 是半透明/全透明（whale-song 0.42、
     maid-atelier transparent），bg-overlay 才是各皮肤为浮动面板准备的高不透明度面
     （0.92+）。带 fallback 链保证任何主题下都有实底。 */
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base, #111418));
  box-shadow: var(--dsw-shadow-lv2);
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.dsh-av-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 10px 12px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  /* 继承面板 overlay 实底，不再单独上底色（皮肤下 bg-base 可能透明）。 */
}
.dsh-av-title {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.dsh-av-count {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.dsh-av-close {
  margin-left: auto;
  padding: 3px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-av-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-av-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dsh-av-note {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-button-ghost-active-fill);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-note-text {
  flex: 1;
  min-width: 0;
}
.dsh-av-note-close {
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-family: inherit;
  font-size: 14px;
  line-height: 18px;
  cursor: pointer;
}
.dsh-av-note-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}

/* ── 工具栏（搜索 + 排序 + 排列 + 设置） ── */
.dsh-av-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh-av-search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 4px 0 8px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-search:focus-within {
  border-color: var(--dsw-alias-focus-ring, var(--dsw-alias-border-l1));
}
.dsh-av-search-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
}
.dsh-av-search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
}
.dsh-av-search-input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-search-input::-webkit-search-cancel-button {
  -webkit-appearance: none;
}
.dsh-av-search-content {
  flex: none;
  height: 20px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-caption);
  font-family: inherit;
  font-size: 11px;
  line-height: 20px;
  cursor: pointer;
}
.dsh-av-search-content:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-av-search-content[data-active="true"] {
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-primary);
}
.dsh-av-search-clear {
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-family: inherit;
  font-size: 13px;
  line-height: 18px;
  cursor: pointer;
}
.dsh-av-search-clear:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-av-toolbar-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dsh-av-select {
  height: 28px;
  max-width: 110px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-av-select:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh-av-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.dsh-av-icon-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-av-icon-btn[data-active="true"] {
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-primary);
}
.dsh-av-seg {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 2px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  gap: 2px;
}
.dsh-av-seg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-family: inherit;
  cursor: pointer;
}
.dsh-av-seg-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-av-seg-btn[data-active="true"] {
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-primary);
}

/* ── 内容搜索进度行 ── */
.dsh-av-scanning {
  flex: none;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-scanning[data-kind="error"] {
  color: var(--dsw-alias-state-error-primary);
}

/* ── 设置弹层（锚在面板右上角） ── */
.dsh-av-settings {
  position: absolute;
  top: 88px;
  right: 12px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 320px;
  max-width: calc(100% - 24px);
  max-height: calc(72vh - 110px);
  overflow-y: auto;
  padding: 12px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base, #111418));
  box-shadow: var(--dsw-shadow-lv2);
}
.dsh-av-settings-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-av-settings-title {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.dsh-av-settings-close {
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-family: inherit;
  font-size: 15px;
  line-height: 22px;
  cursor: pointer;
}
.dsh-av-settings-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-av-settings-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsh-av-settings-label {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-option-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.dsh-av-option {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-av-option:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-av-option[data-active="true"] {
  background: var(--dsw-alias-button-ghost-active-fill);
  border-color: var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
}
.dsh-av-field-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.dsh-av-field-row .dsh-av-select {
  max-width: none;
  flex: 1;
}
.dsh-av-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-av-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-av-toggle-label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-av-toggle[data-active="true"] .dsh-av-toggle-label {
  color: var(--dsw-alias-label-primary);
}
.dsh-av-toggle-desc {
  flex: none;
  max-width: 60%;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-toggle-switch {
  flex: none;
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 8px;
  background: var(--dsw-alias-button-ghost-active-fill);
  transition: background 0.15s ease;
}
.dsh-av-toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary);
  transition: transform 0.15s ease;
}
.dsh-av-toggle[data-active="true"] .dsh-av-toggle-switch {
  background: var(--dsw-alias-focus-ring, var(--dsw-alias-border-l1));
}
.dsh-av-toggle[data-active="true"] .dsh-av-toggle-switch::after {
  transform: translateX(12px);
  background: var(--dsw-alias-label-primary);
}
.dsh-av-settings-foot {
  display: flex;
  justify-content: flex-end;
}

/* ── 列表 / 网格排列 ── */
.dsh-av-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  margin: 0;
}
.dsh-av-list[data-layout="grid"] {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  align-items: start;
  gap: 8px;
}
.dsh-av-list[data-layout="grid"] > div {
  min-width: 0;
}
/* 网格下展开对话的行横跨整行。 */
.dsh-av-list[data-layout="grid"] > div[data-expanded="true"] {
  grid-column: 1 / -1;
}
.dsh-av-list[data-layout="grid"] .dsh-av-row-title {
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.dsh-av-list[data-layout="grid"] .dsh-av-row-head {
  flex-wrap: wrap;
}
.dsh-av-empty {
  margin: 12px auto;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-row {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  /* 行继承面板 overlay 实底；边框提供卡片层次，不再单独上底色。 */
}
.dsh-av-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.dsh-av-row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-av-row-meta {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.dsh-av-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: var(--dsw-alias-button-ghost-active-fill);
  font-size: 11px;
  line-height: 18px;
  color: var(--dsw-alias-label-caption);
}
.dsh-av-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.dsh-av-btn {
  padding: 3px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-av-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-av-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh-av-notice {
  flex: none;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-notice[data-kind="error"] {
  color: var(--dsw-alias-state-error-primary);
}
.dsh-av-log {
  border-top: 1px dashed var(--dsw-alias-border-l2);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 40vh;
  overflow-y: auto;
}
.dsh-av-msg {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsh-av-msg-role {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-caption);
}
.dsh-av-msg-text {
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--dsw-alias-label-secondary);
}
.dsh-av-msg-block {
  font-size: 11px;
  font-style: italic;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-load-older {
  align-self: flex-start;
}
.dsh-av-log-error {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary);
}
.dsh-av-log-empty {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

/* ── 右上角「关闭 dsh」按钮（会话头部 utilities 区；几何参照 CordisPanel 的
     圆形 actionButton，悬停转为错误色提示其破坏性语义） ── */
.dsh-av-shutdown {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.dsh-av-shutdown:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-state-error-primary);
}
.dsh-av-shutdown:disabled {
  opacity: 0.5;
  cursor: default;
}

/* ── 标签筛选栏 ── */
.dsh-av-filter {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 12px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dsh-av-filter-label {
  flex: none;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-filter-mode {
  flex: none;
  display: flex;
  align-items: center;
  height: 24px;
  padding: 2px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  gap: 2px;
}
.dsh-av-filter-mode-btn {
  height: 18px;
  padding: 0 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-family: inherit;
  font-size: 11px;
  line-height: 18px;
  cursor: pointer;
}
.dsh-av-filter-mode-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-av-filter-mode-btn[data-active="true"] {
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-primary);
}
.dsh-av-filter-chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 11px;
  line-height: 24px;
  cursor: pointer;
}
.dsh-av-filter-chip:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-av-filter-chip[data-active="true"] {
  background: var(--dsw-alias-button-ghost-active-fill);
  border-color: var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
}
.dsh-av-filter-chip[data-active="true"][data-kind="agent"] {
  background: var(--dsw-alias-state-info-primary, var(--dsw-alias-focus-ring, var(--dsw-alias-border-l1)));
  border-color: transparent;
  color: var(--dsw-alias-label-primary);
}
.dsh-av-filter-empty {
  flex: none;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}

/* ── 会话标签徽章与编辑 ── */
.dsh-av-tags {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.dsh-av-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 20px;
  padding: 0 4px 0 8px;
  border-radius: 10px;
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 20px;
}
.dsh-av-tag-text {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-av-tag-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-family: inherit;
  font-size: 12px;
  line-height: 16px;
  cursor: pointer;
}
.dsh-av-tag-remove:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh-av-tag-remove:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh-av-tag-editor {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dsh-av-tag-input,
.dsh-av-text-input {
  height: 26px;
  min-width: 0;
  padding: 0 8px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
}
.dsh-av-tag-input {
  flex: 1;
}
.dsh-av-tag-input:focus,
.dsh-av-text-input:focus {
  outline: none;
  border-color: var(--dsw-alias-focus-ring, var(--dsw-alias-border-l1));
}
.dsh-av-settings-desc {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}

/* ── 内嵌 AI 助手小窗口 ── */
.dsh-av-ai {
  flex: none;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base, #111418));
}
.dsh-av-ai-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  box-sizing: border-box;
}
.dsh-av-ai-toggle {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  cursor: pointer;
}
.dsh-av-ai-title {
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.dsh-av-ai-mode {
  flex: none;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--dsw-alias-button-ghost-active-fill);
  color: var(--dsw-alias-label-caption);
  font-size: 10px;
  line-height: 18px;
}
.dsh-av-ai-chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}
.dsh-av-ai-new {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dsh-av-ai-new:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-av-ai-new:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh-av-ai-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 12px 8px;
  box-sizing: border-box;
}
.dsh-av-ai-messages {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}
.dsh-av-ai-msg {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsh-av-ai-msg-role {
  font-size: 10px;
  line-height: 14px;
  color: var(--dsw-alias-label-caption);
}
.dsh-av-ai-msg-text {
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--dsw-alias-label-secondary);
}
.dsh-av-ai-empty {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-ai-sending {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-ai-error {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-state-error-primary);
}
.dsh-av-ai-composer {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dsh-av-ai-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
}
.dsh-av-ai-input:focus {
  outline: none;
  border-color: var(--dsw-alias-focus-ring, var(--dsw-alias-border-l1));
}
.dsh-av-ai-send {
  flex: none;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-av-ai-send:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-av-ai-send:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ── 筛选按钮与筛选菜单 ── */
.dsh-av-filter-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 52px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsh-av-filter-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-av-filter-trigger[data-active="true"] {
  background: var(--dsw-alias-button-ghost-active-fill);
  border-color: var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
}
.dsh-av-filter-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--dsw-alias-focus-ring, var(--dsw-alias-border-l1));
  color: var(--dsw-alias-label-primary);
  font-size: 10px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.dsh-av-filter-menu {
  position: absolute;
  top: 96px;
  right: 12px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 280px;
  max-width: calc(100% - 24px);
  max-height: calc(72vh - 130px);
  overflow-y: auto;
  padding: 12px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base, #111418));
  box-shadow: var(--dsw-shadow-lv2);
}
.dsh-av-filter-menu-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-av-filter-menu-title {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.dsh-av-filter-menu-close {
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-family: inherit;
  font-size: 15px;
  line-height: 22px;
  cursor: pointer;
}
.dsh-av-filter-menu-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-av-filter-menu-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.dsh-av-filter-menu-label {
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-av-filter-search {
  height: 28px;
  padding: 0 8px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
}
.dsh-av-filter-search:focus {
  outline: none;
  border-color: var(--dsw-alias-focus-ring, var(--dsw-alias-border-l1));
}
.dsh-av-filter-menu-tags {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
}
.dsh-av-filter-menu-tags .dsh-av-filter-chip {
  justify-content: flex-start;
  width: 100%;
}
.dsh-av-filter-menu-foot {
  display: flex;
  justify-content: flex-end;
}

/* ── AI 消息代码/长文本折叠 ── */
.dsh-av-code {
  display: block;
  margin: 4px 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-button-ghost-active-fill);
  font-size: 12px;
}
.dsh-av-code summary {
  padding: 4px 8px;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 18px;
  user-select: none;
}
.dsh-av-code pre {
  margin: 0;
  padding: 8px;
  overflow-x: auto;
  border-top: 1px dashed var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 11.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
`
