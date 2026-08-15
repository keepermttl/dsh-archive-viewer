/**
 * ArchivePanelView — 已归档会话查看面板（渲染在 sidebar.footer.action 注册项的
 * fixed 层叠内，样式全部走 --dsw-alias-* 令牌以跟随皮肤）。
 *
 * 数据源（全部只读，均为 client runtime 的实时 store）：
 *  - stores.workspaces：注册表全局归档集合 archivedSessionIds + 工作区视图
 *  - stores.sessions：全部会话行（归档不删除日志，会话仍留在 session.list）
 *  - stores.connection.api.sessions.history：按页读取会话事件（冷会话走
 *    持久化检查，无需激活 Agent）
 *  - GET /api/session.export：宿主侧 ZIP 导出（与官方"下载会话日志"同一端点）
 *
 * 交互能力（v0.2）：
 *  - 关键词搜索：即时匹配标题/ID/工作区；可选「内容」模式逐页扫描每段会话
 *    最近的对话（deepSearch，页数可在设置调整）
 *  - 排序：最近更新 / 名称 / 会话 ID，升序/降序
 *  - 排列：列表（竖列）/ 网格（横排），网格下展开的行横跨整行
 *  - 介绍文本可关闭（settings.showNote，持久化）
 *  - 全量 UI 走 zh/en 双语（i18n.ts），语言偏好可在设置里覆盖
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type {
  ArchiveStores, ConnectionHandle, HistoryEntry, SessionEvent, SessionId,
} from './types.ts'
import { makeT, resolveLang, type TFunc } from './i18n.ts'
import { useSettings, type TagFilterMode } from './settings.ts'
import { SettingsPanel } from './SettingsPanel.tsx'
import { AiHelper, type ArchiveRowInfo } from './AiHelper.tsx'
import { HIDDEN_TAG, useTags } from './tags.ts'
import { useHelperSessionIds } from './helperSessions.ts'

/** 历史一页的消息数（chunk/tool 事件随消息成组返回，20 条消息已是一大页）。 */
const PAGE_SIZE = 20

/** 侧边栏行内只渲染这两类事件（其余如 turn/start、tool/call 等跳过）。 */
const CHAT_TYPES = new Set(['user/message', 'assistant/message'])

/* ── 工具栏图标（与 shell 16px 导航图标观感一致） ── */
const SEARCH_ICON = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>`
const LIST_ICON = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h10"/></svg>`
const GRID_ICON = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="4" height="4" rx="1"/><rect x="9" y="3" width="4" height="4" rx="1"/><rect x="3" y="9" width="4" height="4" rx="1"/><rect x="9" y="9" width="4" height="4" rx="1"/></svg>`
const GEAR_ICON = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4"/></svg>`

/** store 适配器：useSyncExternalStore 直接消费 SnapshotStore。 */
function subscribeOf<T>(store: { subscribe(listener: () => void): () => void }): (listener: () => void) => () => void {
  return listener => store.subscribe(listener)
}
function snapshotOf<T>(store: { getSnapshot(): T }): () => T {
  return () => store.getSnapshot()
}

/** 会话 id → 工作区标题（用于行内归属提示）。 */
function workspaceTitlesOf(items: readonly { sessionIds: readonly string[]; title: string }[]): ReadonlyMap<string, string> {
  const map = new Map<string, string>()
  for (const item of items) {
    for (const id of item.sessionIds) if (!map.has(id)) map.set(id, item.title)
  }
  return map
}

/** 从事件数据提取可读文本。 */
function textOf(event: SessionEvent): string {
  const data = event.data
  if (data.text !== undefined && data.text !== '') return data.text
  const parts: string[] = []
  for (const block of data.content ?? []) {
    if (block.type === 'text') {
      if (block.text !== '') parts.push(block.text)
    } else {
      parts.push(`[${block.type}]`)
    }
  }
  return parts.join('\n')
}

/** 时间戳 → 本地化字符串。 */
function formatTime(time: number): string {
  try {
    return new Date(time).toLocaleString()
  } catch {
    return String(time)
  }
}

/** 干净的下载文件名（宿主端点约定的 id 清理规则）。 */
function zipFilename(sessionId: string): string {
  return `dsh-session-${sessionId.replace(/[^A-Za-z0-9_-]/g, '_')}.zip`
}

/** 触发宿主 ZIP 导出下载（HEAD 预检 + 原生下载锚点，与官方下载逻辑一致）。 */
async function downloadLogZip(sessionId: string): Promise<void> {
  const origin = globalThis.location?.origin
  const url = new URL('/api/session.export', origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal')
  url.searchParams.set('sessionId', sessionId)
  url.searchParams.set('includeDescendants', 'true')
  const response = await fetch(url, { method: 'HEAD' })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status}${detail === '' ? '' : ` ${detail}`}`)
  }
  const anchor = document.createElement('a')
  anchor.href = url.toString()
  anchor.download = zipFilename(sessionId)
  anchor.click()
}

/** 触发宿主取消归档（workspace.unarchiveSession RPC，RPC 信封与官方客户端一致）。 */
async function unarchiveSessionRpc(sessionId: string): Promise<void> {
  const origin = globalThis.location?.origin
  const response = await fetch(
    new URL('/api/workspace.unarchiveSession', origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: crypto.randomUUID(),
        method: 'workspace.unarchiveSession',
        payload: { sessionId },
      }),
    },
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const envelope = (await response.json()) as {
    result?: { ok?: boolean; error?: { message?: string } }
  }
  if (envelope.result?.ok !== true) {
    // 无 message 时抛出空消息，由调用方用当前语言的「未知错误」兜底。
    throw new Error(envelope.result?.error?.message ?? '')
  }
}

/** 复制会话 id（剪贴板 API + 兜底 execCommand）。 */
async function copySessionId(id: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(id)
    return
  } catch {
    // 非安全上下文等场景走兜底
  }
  const textarea = document.createElement('textarea')
  textarea.value = id
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
  } finally {
    textarea.remove()
  }
}

/** 一行会话的对话日志加载器（尾部一页 + 向前翻页）。 */
function useSessionLog(
  connection: ConnectionHandle | undefined,
  sessionId: SessionId,
  enabled: boolean,
  t: TFunc,
): {
  events: HistoryEntry[]
  hasMore: boolean
  loading: boolean
  error: string | null
  loadOlder(): void
} {
  const [events, setEvents] = useState<HistoryEntry[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(async (beforeSeq: number | undefined): Promise<{ events: HistoryEntry[]; hasMore: boolean } | null> => {
    if (connection === undefined) {
      setError(t('connUnavailable'))
      return null
    }
    try {
      const response = await connection.api.sessions.history({
        sessionId,
        ...(beforeSeq === undefined ? {} : { beforeSeq }),
        maxMessages: PAGE_SIZE,
      })
      // RPC 响应的 ok/value/error 都挂在 result 层（rpcId + result 信封）。
      if (!response.result.ok) {
        setError(t('readFailed', { msg: response.result.error?.message ?? t('unknownError') }))
        return null
      }
      return {
        events: response.result.value?.events ?? [],
        hasMore: response.result.value?.hasMore ?? false,
      }
    } catch (cause) {
      setError(t('readFailed', { msg: cause instanceof Error ? cause.message : String(cause) }))
      return null
    }
  }, [connection, sessionId, t])

  // 首次展开时加载尾部一页。
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchPage(undefined).then((page) => {
      if (cancelled || page === null) return
      setEvents(page.events)
      setHasMore(page.hasMore)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [enabled, fetchPage])

  const loadOlder = useCallback(() => {
    if (loading || events.length === 0) return
    const beforeSeq = events[0]?.event.seq
    if (beforeSeq === undefined) return
    setLoading(true)
    void fetchPage(beforeSeq).then((page) => {
      if (page === null) return
      setEvents(prev => [...page.events, ...prev])
      setHasMore(page.hasMore)
      setLoading(false)
    })
  }, [loading, events, fetchPage])

  return { events, hasMore, loading, error, loadOlder }
}

/** 从尾部向前扫描一段会话的对话，返回关键词命中条数（读失败按 0 计）。 */
async function scanSessionContent(
  connection: ConnectionHandle,
  sessionId: SessionId,
  keyword: string,
  maxPages: number,
): Promise<number> {
  let matches = 0
  let beforeSeq: number | undefined
  for (let page = 0; page < maxPages; page += 1) {
    try {
      const response = await connection.api.sessions.history({
        sessionId,
        ...(beforeSeq === undefined ? {} : { beforeSeq }),
        maxMessages: PAGE_SIZE,
      })
      if (!response.result.ok) break
      const events = response.result.value?.events ?? []
      if (events.length === 0) break
      for (const entry of events) {
        const event = entry.event
        if (!CHAT_TYPES.has(event.type)) continue
        if (textOf(event).toLowerCase().includes(keyword)) matches += 1
      }
      if (!(response.result.value?.hasMore ?? false)) break
      const first = events[0]?.event
      if (first === undefined) break
      beforeSeq = first.seq
    } catch {
      break
    }
  }
  return matches
}

interface ContentSearchState {
  /** 会话 id → 命中条数（只有已扫描的会话才有条目）。 */
  matches: ReadonlyMap<SessionId, number>
  /** 是否正在扫描。 */
  scanning: boolean
  /** 已扫描会话数。 */
  done: number
  /** 待扫描会话总数。 */
  total: number
  /** connection 不可用（深度搜索不可执行）。 */
  unavailable: boolean
}

/**
 * 对话内容搜索：开启时按会话逐个从尾部向前扫描（最多 maxPages 页），
 * 命中结果逐条增量发布；关键词变化/扫描页数变化会作废缓存并重新扫描。
 */
function useContentSearch(
  connection: ConnectionHandle | undefined,
  sessionIds: readonly SessionId[],
  keyword: string,
  enabled: boolean,
  maxPages: number,
): ContentSearchState {
  const [matches, setMatches] = useState<ReadonlyMap<SessionId, number>>(new Map())
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [unavailable, setUnavailable] = useState(false)
  const tokenRef = useRef(0)
  const cacheRef = useRef(new Map<SessionId, number>())

  // 关键词变化 → 旧缓存作废（清空后扫描循环会全部重扫）。
  useEffect(() => {
    cacheRef.current.clear()
  }, [keyword])
  // 扫描深度变化 → 同样作废。
  useEffect(() => {
    cacheRef.current.clear()
  }, [maxPages])

  useEffect(() => {
    const token = ++tokenRef.current
    const kw = keyword.trim().toLowerCase()
    if (kw === '' || !enabled) {
      cacheRef.current.clear()
      setMatches(new Map())
      setScanning(false)
      setProgress({ done: 0, total: 0 })
      setUnavailable(false)
      return
    }
    if (connection === undefined) {
      setMatches(new Map())
      setScanning(false)
      setProgress({ done: 0, total: 0 })
      setUnavailable(true)
      return
    }
    const todo = sessionIds.filter((id) => !cacheRef.current.has(id))
    if (todo.length === 0) {
      setMatches(new Map(cacheRef.current))
      setScanning(false)
      setUnavailable(false)
      return
    }
    setUnavailable(false)
    setScanning(true)
    setProgress({ done: 0, total: todo.length })
    void (async () => {
      let done = 0
      for (const id of todo) {
        if (tokenRef.current !== token) return
        const count = await scanSessionContent(connection, id, kw, maxPages)
        if (tokenRef.current !== token) return
        cacheRef.current.set(id, count)
        done += 1
        setMatches(new Map(cacheRef.current))
        setProgress({ done, total: todo.length })
      }
      if (tokenRef.current === token) setScanning(false)
    })()
  }, [connection, sessionIds, keyword, enabled, maxPages])

  return { matches, scanning, done: progress.done, total: progress.total, unavailable }
}

/** 一行归档会话。 */
function ArchiveRow(props: {
  connection: ConnectionHandle | undefined
  sessionId: SessionId
  title: string
  meta: string
  workspace: string | undefined
  open: boolean
  tags: readonly string[]
  onToggleOpen(): void
  onNotice(sessionId: SessionId, text: string, kind?: 'error'): void
  onUnarchive(sessionId: SessionId): Promise<void>
  onAddTag(sessionId: SessionId, tag: string): Promise<void>
  onRemoveTag(sessionId: SessionId, tag: string): Promise<void>
  t: TFunc
}): JSX.Element {
  const { connection, sessionId, title, meta, workspace, open, tags, onToggleOpen, onNotice, onUnarchive, onAddTag, onRemoveTag, t } = props
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [tagEditorOpen, setTagEditorOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tagBusy, setTagBusy] = useState(false)
  const log = useSessionLog(connection, sessionId, open, t)

  const runAction = useCallback(async (kind: 'download' | 'copy' | 'unarchive') => {
    setBusyAction(kind)
    try {
      if (kind === 'download') {
        await downloadLogZip(sessionId)
        onNotice(sessionId, t('downloadStarted'))
      } else if (kind === 'copy') {
        await copySessionId(sessionId)
        onNotice(sessionId, t('idCopied'))
      } else {
        await onUnarchive(sessionId)
      }
    } catch (cause) {
      const msg = cause instanceof Error && cause.message !== '' ? cause.message : t('unknownError')
      onNotice(sessionId, t('actionFailed', { msg }), 'error')
    } finally {
      setBusyAction(null)
    }
  }, [sessionId, onNotice, onUnarchive, t])

  const runTagAdd = useCallback(async () => {
    const tag = tagInput.trim().replace(/\s+/g, ' ')
    if (tag === '' || tagBusy) return
    setTagBusy(true)
    try {
      await onAddTag(sessionId, tag)
      setTagInput('')
      setTagEditorOpen(false)
      onNotice(sessionId, t('tagAdded'))
    } catch (cause) {
      const msg = cause instanceof Error && cause.message !== '' ? cause.message : t('unknownError')
      onNotice(sessionId, t('actionFailed', { msg }), 'error')
    } finally {
      setTagBusy(false)
    }
  }, [tagInput, tagBusy, sessionId, onAddTag, onNotice, t])

  const runTagRemove = useCallback(async (tag: string) => {
    if (tagBusy) return
    setTagBusy(true)
    try {
      await onRemoveTag(sessionId, tag)
    } catch (cause) {
      const msg = cause instanceof Error && cause.message !== '' ? cause.message : t('unknownError')
      onNotice(sessionId, t('actionFailed', { msg }), 'error')
    } finally {
      setTagBusy(false)
    }
  }, [tagBusy, sessionId, onRemoveTag, onNotice, t])

  return (
    <div className="dsh-av-row">
      <div className="dsh-av-row-head">
        <span className="dsh-av-row-title" title={sessionId}>{title}</span>
        {workspace !== undefined && <span className="dsh-av-badge">{workspace}</span>}
        <span className="dsh-av-row-meta">{meta}</span>
      </div>
      {tags.length > 0 && (
        <div className="dsh-av-tags">
          {tags.map(tag => (
            <span key={tag} className="dsh-av-tag">
              <span className="dsh-av-tag-text">{tag}</span>
              <button
                type="button"
                className="dsh-av-tag-remove"
                aria-label={t('removeTag', { tag })}
                title={t('removeTag', { tag })}
                disabled={tagBusy}
                onClick={() => { void runTagRemove(tag) }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="dsh-av-actions">
        <button type="button" className="dsh-av-btn" onClick={onToggleOpen}>
          {open ? t('collapseChat') : t('viewChat')}
        </button>
        <button type="button" className="dsh-av-btn" disabled={busyAction !== null} onClick={() => void runAction('unarchive')}>
          {busyAction === 'unarchive' ? t('restoring') : t('restore')}
        </button>
        <button type="button" className="dsh-av-btn" disabled={busyAction !== null} onClick={() => void runAction('download')}>
          {busyAction === 'download' ? t('downloading') : t('downloadZip')}
        </button>
        <button type="button" className="dsh-av-btn" disabled={busyAction !== null} onClick={() => void runAction('copy')}>
          {busyAction === 'copy' ? t('copying') : t('copyId')}
        </button>
        <button
          type="button"
          className="dsh-av-btn"
          data-active={tagEditorOpen || undefined}
          disabled={tagBusy}
          onClick={() => { setTagEditorOpen(value => !value) }}
        >
          {t('tags')}
        </button>
      </div>
      {tagEditorOpen && (
        <div className="dsh-av-tag-editor">
          <input
            type="text"
            className="dsh-av-tag-input"
            value={tagInput}
            placeholder={t('tagPlaceholder')}
            aria-label={t('tagPlaceholder')}
            onChange={(event) => { setTagInput(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void runTagAdd()
              }
            }}
          />
          <button type="button" className="dsh-av-btn" disabled={tagBusy || tagInput.trim() === ''} onClick={() => { void runTagAdd() }}>
            {t('addTag')}
          </button>
          <button type="button" className="dsh-av-btn" disabled={tagBusy} onClick={() => { setTagEditorOpen(false) }}>
            {t('close')}
          </button>
        </div>
      )}
      {open && (
        <div className="dsh-av-log">
          {log.error !== null && <div className="dsh-av-log-error">{log.error}</div>}
          {log.loading && log.events.length === 0 && <div className="dsh-av-log-empty">{t('readingChat')}</div>}
          {!log.loading && log.error === null && log.events.length === 0 && (
            <div className="dsh-av-log-empty">{t('noMessages')}</div>
          )}
          {log.events.map(({ event }) => {
            if (!CHAT_TYPES.has(event.type)) return null
            const role = event.type === 'user/message' ? t('roleYou') : t('roleAssistant')
            return (
              <div className="dsh-av-msg" key={event.seq}>
                <span className="dsh-av-msg-role">{role} · {formatTime(event.time)}</span>
                <span className="dsh-av-msg-text">{textOf(event)}</span>
              </div>
            )
          })}
          {log.hasMore && (
            <button type="button" className="dsh-av-btn dsh-av-load-older" disabled={log.loading} onClick={log.loadOlder}>
              {log.loading ? t('loading') : t('loadOlder')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** 面板主体。 */
export function ArchivePanelView(props: { stores: ArchiveStores; onClose(): void }): JSX.Element {
  const { stores, onClose } = props
  const [settings, updateSettings, resetSettings] = useSettings()
  const t = useMemo(() => makeT(resolveLang(settings.lang)), [settings.lang])
  const sessionState = useSyncExternalStore(
    subscribeOf(stores.sessions),
    snapshotOf(stores.sessions),
  )
  const workspaceState = useSyncExternalStore(
    subscribeOf(stores.workspaces),
    snapshotOf(stores.workspaces),
  )
  const [notices, setNotices] = useState<Readonly<Record<string, { text: string; kind?: 'error' }>>>({})
  const [query, setQuery] = useState('')
  const [effectiveQuery, setEffectiveQuery] = useState('')
  const [openIds, setOpenIds] = useState<ReadonlySet<SessionId>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedTags, setSelectedTags] = useState<ReadonlySet<string>>(new Set())
  const [agentSearchActive, setAgentSearchActive] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  const tagsApi = useTags(true, 5000)
  const helperIds = useHelperSessionIds()

  const workspaceTitles = useMemo(() => workspaceTitlesOf(workspaceState.items), [workspaceState.items])

  // 全部自定义标签（隐藏的 agent 检索标签不进入普通标签列表）。
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const list of Object.values(tagsApi.tags)) {
      for (const tag of list) {
        if (tag !== HIDDEN_TAG) set.add(tag)
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }, [tagsApi.tags])

  // agent 添加隐藏检索标签后，自动打开「Agent 检索」筛选。
  useEffect(() => {
    const hasHidden = Object.values(tagsApi.tags).some(list => list.includes(HIDDEN_TAG))
    if (hasHidden) setAgentSearchActive(true)
  }, [tagsApi.tags])

  const activeFilterCount = (agentSearchActive ? 1 : 0) + selectedTags.size
  const filteredTags = useMemo(() => {
    const kw = tagQuery.trim().toLowerCase()
    if (kw === '') return allTags
    return allTags.filter(tag => tag.toLowerCase().includes(kw))
  }, [allTags, tagQuery])

  // 归档集合是注册表全局的；排序/过滤在 rows 里做。
  const baseRows = useMemo(() => {
    return workspaceState.archivedSessionIds
      .filter(id => !helperIds.has(id))
      .map((id) => {
        const summary = sessionState.byId[id]
        const title = summary?.displayTitle ?? summary?.title ?? t('untitled', { id })
        const meta = summary === undefined
          ? t('summaryUnavailable')
          : `${formatTime(summary.updatedAt)}${summary.running ? ` · ${t('running')}` : ''}${summary.blank ? ` · ${t('blank')}` : ''}`
        return { id, title, meta, updatedAt: summary?.updatedAt ?? 0, workspace: workspaceTitles.get(id) }
      })
  }, [workspaceState.archivedSessionIds, sessionState.byId, workspaceTitles, t, helperIds])

  // 给 AI 助手的归档会话清单（用于 agent 检索范围）。
  const archiveRows = useMemo<ArchiveRowInfo[]>(
    () => baseRows.map(row => ({ id: row.id, title: row.title, workspace: row.workspace })),
    [baseRows],
  )

  // 搜索输入防抖（250ms），避免逐键触发内容扫描。
  useEffect(() => {
    const handle = window.setTimeout(() => { setEffectiveQuery(query.trim()) }, 250)
    return () => { window.clearTimeout(handle) }
  }, [query])

  const sessionIds = useMemo(() => baseRows.map(row => row.id), [baseRows])
  const contentSearch = useContentSearch(
    stores.connection,
    sessionIds,
    effectiveQuery,
    settings.deepSearch,
    settings.deepSearchPages,
  )

  // 过滤（关键词 + 标签/Agent 检索） + 排序。
  const rows = useMemo(() => {
    const kw = effectiveQuery.toLowerCase()
    const tagMode: TagFilterMode = settings.tagFilterMode
    const customTags = [...selectedTags]
    let list = baseRows
    if (kw !== '') {
      list = list.filter((row) => (
        row.title.toLowerCase().includes(kw)
        || row.id.toLowerCase().includes(kw)
        || (row.workspace?.toLowerCase().includes(kw) ?? false)
        || (contentSearch.matches.get(row.id) ?? 0) > 0
      ))
    }
    if (agentSearchActive || customTags.length > 0) {
      list = list.filter((row) => {
        const rowTags = tagsApi.tags[row.id] ?? []
        if (agentSearchActive && !rowTags.includes(HIDDEN_TAG)) return false
        if (customTags.length === 0) return true
        if (tagMode === 'and') {
          return customTags.every(tag => rowTags.includes(tag))
        }
        return customTags.some(tag => rowTags.includes(tag))
      })
    }
    const dir = settings.sortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      switch (settings.sortKey) {
        case 'title':
          return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }) * dir
        case 'sessionId':
          return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }) * dir
        default:
          return (a.updatedAt - b.updatedAt) * dir
      }
    })
  }, [baseRows, effectiveQuery, contentSearch.matches, settings.sortKey, settings.sortDir, selectedTags, agentSearchActive, tagsApi.tags, settings.tagFilterMode])

  const onNotice = useCallback((sessionId: string, text: string, kind?: 'error') => {
    setNotices(prev => ({ ...prev, [sessionId]: { text, kind } }))
  }, [])

  const toggleOpen = useCallback((id: SessionId) => {
    setOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // 取消归档：RPC 成功后 host/archived-sessions-changed 帧会实时更新归档集合，
  // 该行随之从本面板消失并回到原工作区分组；面板级横幅提示结果。
  const [banner, setBanner] = useState<{ text: string; kind?: 'error' } | null>(null)
  const bannerTimer = useRef<number | undefined>(undefined)
  const onUnarchive = useCallback(async (sessionId: string) => {
    try {
      await unarchiveSessionRpc(sessionId)
      setBanner({ text: t('restored') })
    } catch (cause) {
      const msg = cause instanceof Error && cause.message !== '' ? cause.message : t('unknownError')
      setBanner({ text: t('restoreFailed', { msg }), kind: 'error' })
    }
    window.clearTimeout(bannerTimer.current)
    bannerTimer.current = window.setTimeout(() => setBanner(null), 5000)
  }, [t])

  const dismissNote = useCallback(() => {
    updateSettings({ showNote: false })
    setBanner({ text: t('noteDismissed') })
    window.clearTimeout(bannerTimer.current)
    bannerTimer.current = window.setTimeout(() => setBanner(null), 5000)
  }, [updateSettings, t])

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }, [])

  const toggleAgentSearch = useCallback(async (active: boolean) => {
    if (active) {
      setAgentSearchActive(true)
      return
    }
    setAgentSearchActive(false)
    try {
      await tagsApi.clearHidden()
    } catch (cause) {
      const msg = cause instanceof Error && cause.message !== '' ? cause.message : t('unknownError')
      setBanner({ text: t('actionFailed', { msg }), kind: 'error' })
      window.clearTimeout(bannerTimer.current)
      bannerTimer.current = window.setTimeout(() => setBanner(null), 5000)
    }
  }, [tagsApi, t])

  const clearAllFilters = useCallback(() => {
    setSelectedTags(new Set())
    if (agentSearchActive) void toggleAgentSearch(false)
  }, [agentSearchActive, toggleAgentSearch])

  const handleAddTag = useCallback((sessionId: SessionId, tag: string) => {
    if (tag === HIDDEN_TAG) return Promise.reject(new Error(t('reservedTag')))
    return tagsApi.addTags(sessionId, [tag])
  }, [tagsApi, t])

  const handleRemoveTag = useCallback((sessionId: SessionId, tag: string) => {
    return tagsApi.removeTags(sessionId, [tag])
  }, [tagsApi])

  useEffect(() => () => { window.clearTimeout(bannerTimer.current) }, [])

  return (
    <div data-dsh-archive-viewer-panel>
      <div className="dsh-av-header">
        <h2 className="dsh-av-title">{t('panelTitle')}</h2>
        <span className="dsh-av-count">{t('count', { n: rows.length })}</span>
        <button type="button" className="dsh-av-close" onClick={onClose}>{t('close')}</button>
      </div>

      {/* 工具栏：搜索 + 排序 + 排列 + 设置 */}
      <div className="dsh-av-toolbar">
        <div className="dsh-av-search">
          <span className="dsh-av-search-icon" dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
          <input
            type="search"
            className="dsh-av-search-input"
            value={query}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            onChange={(event) => { setQuery(event.target.value) }}
          />
          <button
            type="button"
            className="dsh-av-search-content"
            data-active={settings.deepSearch || undefined}
            title={t('searchContentTip')}
            aria-pressed={settings.deepSearch}
            onClick={() => { updateSettings({ deepSearch: !settings.deepSearch }) }}
          >
            {t('searchContent')}
          </button>
          {query !== '' && (
            <button
              type="button"
              className="dsh-av-search-clear"
              aria-label={t('close')}
              title={t('close')}
              onClick={() => { setQuery('') }}
            >
              ×
            </button>
          )}
        </div>
        <div className="dsh-av-toolbar-actions">
          <select
            className="dsh-av-select"
            aria-label={t('sortBy')}
            value={settings.sortKey}
            onChange={(event) => { updateSettings({ sortKey: event.target.value as 'updatedAt' | 'title' | 'sessionId' }) }}
          >
            <option value="updatedAt">{t('sortUpdatedAt')}</option>
            <option value="title">{t('sortTitle')}</option>
            <option value="sessionId">{t('sortSessionId')}</option>
          </select>
          <button
            type="button"
            className="dsh-av-icon-btn"
            title={`${t('direction')} · ${t(settings.sortDir === 'asc' ? 'asc' : 'desc')}`}
            aria-label={t(settings.sortDir === 'asc' ? 'asc' : 'desc')}
            onClick={() => { updateSettings({ sortDir: settings.sortDir === 'asc' ? 'desc' : 'asc' }) }}
          >
            <span aria-hidden="true">{settings.sortDir === 'asc' ? '↑' : '↓'}</span>
          </button>
          <button
            type="button"
            className="dsh-av-filter-trigger"
            data-active={filterOpen || activeFilterCount > 0 || undefined}
            aria-expanded={filterOpen}
            title={t('filterByTags')}
            onClick={() => { setFilterOpen(value => !value) }}
          >
            <span>{t('filter')}</span>
            {activeFilterCount > 0 && <span className="dsh-av-filter-count">{activeFilterCount}</span>}
          </button>
          <div className="dsh-av-seg" role="group" aria-label={t('layout')}>
            <button
              type="button"
              className="dsh-av-seg-btn"
              data-active={settings.layout === 'list' || undefined}
              aria-pressed={settings.layout === 'list'}
              title={t('layoutList')}
              onClick={() => { updateSettings({ layout: 'list' }) }}
            >
              <span dangerouslySetInnerHTML={{ __html: LIST_ICON }} />
            </button>
            <button
              type="button"
              className="dsh-av-seg-btn"
              data-active={settings.layout === 'grid' || undefined}
              aria-pressed={settings.layout === 'grid'}
              title={t('layoutGrid')}
              onClick={() => { updateSettings({ layout: 'grid' }) }}
            >
              <span dangerouslySetInnerHTML={{ __html: GRID_ICON }} />
            </button>
          </div>
          <button
            type="button"
            className="dsh-av-icon-btn"
            data-active={settingsOpen || undefined}
            title={t('settings')}
            aria-label={t('settings')}
            aria-expanded={settingsOpen}
            onClick={() => { setSettingsOpen(value => !value) }}
          >
            <span dangerouslySetInnerHTML={{ __html: GEAR_ICON }} />
          </button>
        </div>
      </div>

      {/* 筛选菜单：标签多选 + AND/OR + Agent 检索开关 + 标签搜索 */}
      {filterOpen && (
        <div className="dsh-av-filter-menu" role="dialog" aria-label={t('filterByTags')}>
          <div className="dsh-av-filter-menu-head">
            <span className="dsh-av-filter-menu-title">{t('filterByTags')}</span>
            <button
              type="button"
              className="dsh-av-filter-menu-close"
              aria-label={t('close')}
              onClick={() => { setFilterOpen(false) }}
            >
              ×
            </button>
          </div>
          <div className="dsh-av-filter-menu-row">
            <span className="dsh-av-filter-menu-label">{t('tagFilterMode')}</span>
            <div className="dsh-av-filter-mode" role="group" aria-label={t('tagFilterMode')}>
              <button
                type="button"
                className="dsh-av-filter-mode-btn"
                data-active={settings.tagFilterMode === 'or' || undefined}
                aria-pressed={settings.tagFilterMode === 'or'}
                onClick={() => { updateSettings({ tagFilterMode: 'or' }) }}
              >
                {t('tagFilterOr')}
              </button>
              <button
                type="button"
                className="dsh-av-filter-mode-btn"
                data-active={settings.tagFilterMode === 'and' || undefined}
                aria-pressed={settings.tagFilterMode === 'and'}
                onClick={() => { updateSettings({ tagFilterMode: 'and' }) }}
              >
                {t('tagFilterAnd')}
              </button>
            </div>
          </div>
          <div className="dsh-av-filter-menu-row">
            <button
              type="button"
              className="dsh-av-filter-chip"
              data-active={agentSearchActive || undefined}
              data-kind={agentSearchActive ? 'agent' : undefined}
              aria-pressed={agentSearchActive}
              title={t('agentSearchTip')}
              onClick={() => { void toggleAgentSearch(!agentSearchActive) }}
            >
              {t('agentSearch')}
            </button>
          </div>
          <input
            type="search"
            className="dsh-av-filter-search"
            value={tagQuery}
            placeholder={t('filterSearchPlaceholder')}
            aria-label={t('filterSearchPlaceholder')}
            onChange={(event) => { setTagQuery(event.target.value) }}
          />
          <div className="dsh-av-filter-menu-tags">
            {filteredTags.map(tag => (
              <button
                key={tag}
                type="button"
                className="dsh-av-filter-chip"
                data-active={selectedTags.has(tag) || undefined}
                aria-pressed={selectedTags.has(tag)}
                onClick={() => { toggleTag(tag) }}
              >
                {tag}
              </button>
            ))}
            {filteredTags.length === 0 && (
              <span className="dsh-av-filter-empty">{t('noTags')}</span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <div className="dsh-av-filter-menu-foot">
              <button
                type="button"
                className="dsh-av-btn"
                onClick={clearAllFilters}
              >
                {t('clearFilters')}
              </button>
            </div>
          )}
        </div>
      )}

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          update={updateSettings}
          reset={resetSettings}
          t={t}
          connection={stores.connection}
          onClose={() => { setSettingsOpen(false) }}
        />
      )}

      <div className="dsh-av-body">
        {settings.showNote && (
          <div className="dsh-av-note">
            <span className="dsh-av-note-text">{t('note')}</span>
            <button
              type="button"
              className="dsh-av-note-close"
              aria-label={t('close')}
              title={t('close')}
              onClick={dismissNote}
            >
              ×
            </button>
          </div>
        )}
        {(contentSearch.scanning || contentSearch.unavailable) && (
          <div className="dsh-av-scanning" data-kind={contentSearch.unavailable ? 'error' : undefined}>
            {contentSearch.unavailable
              ? t('connUnavailable')
              : t('searchingContent', { done: contentSearch.done, total: contentSearch.total })}
          </div>
        )}
        {banner !== null && (
          <div className="dsh-av-notice" data-kind={banner.kind}>{banner.text}</div>
        )}
        <div className="dsh-av-list" data-layout={settings.layout}>
          {!workspaceState.baselinesReady && <div className="dsh-av-empty">{t('loadingSessions')}</div>}
          {workspaceState.baselinesReady && rows.length === 0 && (
            <div className="dsh-av-empty">{effectiveQuery === '' ? t('noArchived') : t('noMatch')}</div>
          )}
          {rows.map((row) => {
            const open = openIds.has(row.id)
            const hits = effectiveQuery === '' ? 0 : (contentSearch.matches.get(row.id) ?? 0)
            const meta = hits > 0 ? `${row.meta} · ${t('contentMatches', { n: hits })}` : row.meta
            const rowTags = (tagsApi.tags[row.id] ?? []).filter(tag => tag !== HIDDEN_TAG)
            return (
              <div key={row.id} data-expanded={open || undefined}>
                <ArchiveRow
                  connection={stores.connection}
                  sessionId={row.id}
                  title={row.title}
                  meta={meta}
                  workspace={row.workspace}
                  open={open}
                  tags={rowTags}
                  onToggleOpen={() => { toggleOpen(row.id) }}
                  onNotice={onNotice}
                  onUnarchive={onUnarchive}
                  onAddTag={handleAddTag}
                  onRemoveTag={handleRemoveTag}
                  t={t}
                />
                {notices[row.id] !== undefined && (
                  <div className="dsh-av-notice" data-kind={notices[row.id]!.kind}>
                    {notices[row.id]!.text}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <AiHelper
        connection={stores.connection}
        settings={settings}
        t={t}
        sessionState={sessionState}
        archiveRows={archiveRows}
        onTagsChanged={() => { void tagsApi.refresh() }}
      />
    </div>
  )
}
