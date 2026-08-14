/**
 * 轻量 i18n：zh / en 双语字典 + 语言检测。
 *
 * 字典是扁平 key → 模板字符串（{name} 占位符），t(key, vars) 负责渲染。
 * 语言解析顺序：设置里的显式偏好（lang）> 浏览器语言（navigator.language，
 * 以 zh 开头视为中文，其余回退英文）。
 */

export type Lang = 'zh' | 'en'

export type LangPref = 'auto' | Lang

/** 翻译函数签名（makeT 的返回类型）。 */
export type TFunc = (key: MessageKey, vars?: Record<string, string | number>) => string

const zh = {
  // ── 面板 ──
  panelTitle: '已归档会话',
  count: '{n} 个',
  close: '关闭',
  note: '归档会话被隐藏在所有会话列表与搜索之外，但日志、附件与工作区分组位置完整保留。可查看对话、导出 ZIP，或点击「恢复会话」取消归档——恢复后立即回到原工作区分组。',
  loadingSessions: '正在加载会话列表…',
  noArchived: '没有已归档的会话',
  noMatch: '没有匹配的会话',
  // ── 搜索 ──
  searchPlaceholder: '搜索标题、ID、工作区…',
  searchContent: '内容',
  searchContentTip: '同时搜索对话内容（逐页扫描每段会话最近的对话）',
  searchingContent: '正在搜索对话内容 {done}/{total}…',
  contentMatches: '内容命中 {n}',
  // ── 排序 ──
  sortBy: '排序方式',
  sortUpdatedAt: '最近更新',
  sortTitle: '名称',
  sortSessionId: '会话 ID',
  direction: '方向',
  asc: '升序',
  desc: '降序',
  // ── 布局 ──
  layout: '排列方式',
  layoutList: '列表',
  layoutGrid: '网格',
  // ── 设置 ──
  settings: '设置',
  settingsTitle: '查看器设置',
  lang: '语言',
  langAuto: '跟随系统',
  langZh: '中文',
  langEn: 'English',
  sectionSearch: '搜索',
  deepSearch: '搜索对话内容',
  deepSearchDesc: '开启后，关键词会逐页扫描每段归档会话最近的对话（扫描页数见下方）。会话较多时可能稍慢。',
  scanPages: '每会话扫描页数',
  sectionSort: '排序',
  sectionLayout: '排列',
  sectionUi: '界面',
  showNote: '显示介绍文本',
  reset: '恢复默认',
  resetDone: '已恢复默认设置',
  noteDismissed: '介绍文本已隐藏，可在设置中重新开启',
  // ── 行操作 ──
  viewChat: '查看对话',
  collapseChat: '收起对话',
  restore: '恢复会话',
  restoring: '恢复中…',
  downloadZip: '下载日志 (ZIP)',
  downloading: '下载中…',
  copyId: '复制 ID',
  copying: '复制中…',
  loadOlder: '加载更早',
  loading: '加载中…',
  readingChat: '正在读取对话…',
  noMessages: '该会话没有可见消息（可能只有工具/系统事件）',
  summaryUnavailable: '摘要暂不可用',
  running: '运行中',
  blank: '空白',
  untitled: '未命名会话 ({id})',
  restored: '会话已恢复，已回到原工作区分组',
  restoreFailed: '恢复失败：{msg}',
  downloadStarted: '已开始下载日志 ZIP',
  idCopied: '会话 ID 已复制',
  actionFailed: '操作失败：{msg}',
  readFailed: '读取失败：{msg}',
  unknownError: '未知错误',
  connUnavailable: 'connection 服务不可用',
  roleYou: '你',
  roleAssistant: '助手',
  // ── 关闭 dsh ──
  shutdownConfirm: '确定要关闭 dsh 吗？\n\n所有会话日志均已持久化，重启后原样恢复。',
  shutdownFailed: '关闭失败：{msg}',
  shutdownTitle: '关闭 dsh',
} as const

export type MessageKey = keyof typeof zh

const en: Record<MessageKey, string> = {
  panelTitle: 'Archived Sessions',
  count: '{n} items',
  close: 'Close',
  note: 'Archived sessions are hidden from all session lists and search, but their logs, attachments, and workspace placement are fully preserved. View the chat, export a ZIP, or click "Restore" to unarchive — the session immediately returns to its original workspace.',
  loadingSessions: 'Loading sessions…',
  noArchived: 'No archived sessions',
  noMatch: 'No matching sessions',
  searchPlaceholder: 'Search title, ID, workspace…',
  searchContent: 'Content',
  searchContentTip: 'Also search message content (scans recent messages of each session page by page)',
  searchingContent: 'Searching message content {done}/{total}…',
  contentMatches: '{n} content hits',
  sortBy: 'Sort by',
  sortUpdatedAt: 'Last updated',
  sortTitle: 'Name',
  sortSessionId: 'Session ID',
  direction: 'Direction',
  asc: 'Ascending',
  desc: 'Descending',
  layout: 'Layout',
  layoutList: 'List',
  layoutGrid: 'Grid',
  settings: 'Settings',
  settingsTitle: 'Viewer Settings',
  lang: 'Language',
  langAuto: 'System default',
  langZh: '中文',
  langEn: 'English',
  sectionSearch: 'Search',
  deepSearch: 'Search message content',
  deepSearchDesc: 'When enabled, the keyword also scans the recent messages of each archived session page by page (see pages below). May be slower with many sessions.',
  scanPages: 'Pages scanned per session',
  sectionSort: 'Sort',
  sectionLayout: 'Layout',
  sectionUi: 'Interface',
  showNote: 'Show intro note',
  reset: 'Reset defaults',
  resetDone: 'Settings reset to defaults',
  noteDismissed: 'Intro note hidden — re-enable it in Settings',
  viewChat: 'View chat',
  collapseChat: 'Collapse chat',
  restore: 'Restore',
  restoring: 'Restoring…',
  downloadZip: 'Download log (ZIP)',
  downloading: 'Downloading…',
  copyId: 'Copy ID',
  copying: 'Copying…',
  loadOlder: 'Load older',
  loading: 'Loading…',
  readingChat: 'Reading chat…',
  noMessages: 'This session has no visible messages (tool/system events only)',
  summaryUnavailable: 'Summary unavailable',
  running: 'running',
  blank: 'blank',
  untitled: 'Untitled session ({id})',
  restored: 'Session restored to its original workspace',
  restoreFailed: 'Restore failed: {msg}',
  downloadStarted: 'Started downloading log ZIP',
  idCopied: 'Session ID copied',
  actionFailed: 'Action failed: {msg}',
  readFailed: 'Failed to read: {msg}',
  unknownError: 'Unknown error',
  connUnavailable: 'connection service unavailable',
  roleYou: 'You',
  roleAssistant: 'Assistant',
  shutdownConfirm: 'Shut down dsh?\n\nAll session logs are persisted and will be restored on restart.',
  shutdownFailed: 'Shutdown failed: {msg}',
  shutdownTitle: 'Shut down dsh',
}

/** 浏览器语言 → 插件语言（zh 开头视为中文，其余英文）。 */
export function detectLang(): Lang {
  const lang = (globalThis.navigator?.language ?? '').toLowerCase()
  return lang.startsWith('zh') ? 'zh' : 'en'
}

/** 设置偏好 → 实际语言。 */
export function resolveLang(pref: LangPref): Lang {
  return pref === 'auto' ? detectLang() : pref
}

const tCache = new Map<Lang, TFunc>()

/** 取某语言的翻译函数（结果缓存，避免每次渲染重建）。 */
export function makeT(lang: Lang): TFunc {
  let t = tCache.get(lang)
  if (t === undefined) {
    const table = lang === 'en' ? en : zh
    t = (key, vars) => {
      let text: string = table[key] ?? zh[key]
      if (vars !== undefined) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replaceAll(`{${name}}`, String(value))
        }
      }
      return text
    }
    tCache.set(lang, t)
  }
  return t
}
