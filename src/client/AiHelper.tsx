/**
 * AiHelper — 归档面板底部的内嵌 AI 助手小窗口。
 *
 * 不重复实现完整聊天 UI：它通过 DSH 官方会话 API 驱动一个真实 DSH agent 会话
 * （默认 standard 标准模式，可在设置中改为其他 agent preset）：
 *  - 新建/投递/选模型走 dshApi.ts（官方 unary RPC，命名空间服务优先）；
 *  - 读回复走插件宿主路由 /api/archive-viewer/history（宿主读日志并归一化）；
 *  - helper 会话的归档/删除走插件宿主路由（见 helperSessions.ts）。
 * agent 可以通过 host 半区提供的 /api/archive-viewer/tags 接口给归档会话
 * 添加/移除标签（含隐藏临时检索标签）。
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ArchiveSettings } from './settings.ts'
import type { TFunc } from './i18n.ts'
import type { HistoryEntry, SessionEvent, SessionListState } from './types.ts'
import type { DshApi } from './dshApi.ts'
import {
  addHelperSession,
  archiveHelperSession,
  deleteHelperSessionOnHost,
  registerHelperSessionOnHost,
  removeHelperSession,
  unregisterHelperSessionOnHost,
} from './helperSessions.ts'

/** 种子指令标记：首条用户消息里夹带的“系统说明”，UI 不把它显示成普通用户消息。 */
const SEED_MARKER = '[dsh-archive-viewer-instruction]'
const SEED_DELIM = '\n\n--- 用户问题 ---\n\n'

/** 复用的 AI 助手会话 id（localStorage，减少重复创建 DSH 会话）。 */
const AI_SESSION_KEY = 'dsh-archive-viewer:ai-session:v1'

/** 展示用的会话消息。 */
interface ChatMessage {
  seq: number
  role: 'user' | 'assistant'
  text: string
}

/** 消息展示块：自然语言文本或需要折叠的代码/长文本。 */
interface MessageBlock {
  kind: 'text' | 'code'
  content: string
  collapsed?: boolean
}

/** 将消息拆成文本块与代码块；超长文本也折叠。 */
function splitMessage(text: string): MessageBlock[] {
  const blocks: MessageBlock[] = []
  const codeRe = /```([\w+-]*)\n?([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = codeRe.exec(text)) !== null) {
    if (match.index > last) pushTextBlock(text.slice(last, match.index), blocks)
    blocks.push({ kind: 'code', content: match[2] ?? '' })
    last = match.index + match[0].length
  }
  if (last < text.length) pushTextBlock(text.slice(last), blocks)
  if (blocks.length === 0) pushTextBlock(text, blocks)
  return blocks
}

function pushTextBlock(text: string, blocks: MessageBlock[]): void {
  const trimmed = text.trim()
  if (trimmed === '') return
  const lineCount = text.split('\n').length
  const collapsed = text.length > 2000 || lineCount > 80
  blocks.push({ kind: 'text', content: text, collapsed })
}

/** 消息文本渲染：代码块/超长文本折叠为 <details>。 */
function MessageText(props: { text: string; t: TFunc }): JSX.Element {
  const { text, t } = props
  const blocks = splitMessage(text)
  return (
    <div className="dsh-av-ai-msg-text">
      {blocks.map((block, index) => {
        if (block.kind === 'code') {
          const lines = block.content.split('\n').length
          return (
            <details key={index} className="dsh-av-code">
              <summary>{t('aiCodeBlock', { lines })}</summary>
              <pre>{block.content}</pre>
            </details>
          )
        }
        if (block.collapsed === true) {
          const lines = block.content.split('\n').length
          return (
            <details key={index} className="dsh-av-code">
              <summary>{t('aiLongText', { lines })}</summary>
              <pre>{block.content}</pre>
            </details>
          )
        }
        return <span key={index} className="dsh-av-ai-text-part">{block.content}</span>
      })}
    </div>
  )
}

/** 归档会话摘要（用于给 agent 提供检索范围）。 */
export interface ArchiveRowInfo {
  id: string
  title: string
  workspace?: string
}

function eventText(event: SessionEvent): string {
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

/** 用户消息若包含种子指令，则只展示指令分隔符之后的真实提问。 */
function displayUserText(raw: string): string {
  if (raw.startsWith(SEED_MARKER)) {
    const at = raw.indexOf(SEED_DELIM)
    if (at !== -1) return raw.slice(at + SEED_DELIM.length)
    return raw.slice(SEED_MARKER.length).trim()
  }
  return raw
}

function buildInstruction(t: TFunc, rows: readonly ArchiveRowInfo[]): string {
  const origin = globalThis.location?.origin ?? 'http://dsh.internal'
  const api = `${origin}/api/archive-viewer/tags`
  const sessions = rows.length === 0
    ? t('aiNoArchivedSessions')
    : rows.map(row => `- ${row.id} | ${row.title}${row.workspace === undefined ? '' : ` | ${row.workspace}`}`).join('\n')
  return `${SEED_MARKER}\n${t('aiInstruction', { api, sessions })}\n${SEED_DELIM}`
}

export function AiHelper(props: {
  dsh: DshApi
  settings: ArchiveSettings
  t: TFunc
  sessionState: SessionListState
  archiveRows: readonly ArchiveRowInfo[]
  onTagsChanged(): void
}): JSX.Element {
  const { dsh, settings, t, sessionState, archiveRows, onTagsChanged } = props

  const [expanded, setExpanded] = useState(true)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seeded, setSeeded] = useState(false)

  const sessionIdRef = useRef<string | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const dshRef = useRef(dsh)
  const settingsRef = useRef(settings)
  const sessionStateRef = useRef(sessionState)
  const onTagsChangedRef = useRef(onTagsChanged)
  const pollTimerRef = useRef<number | undefined>(undefined)
  const pollCountRef = useRef(0)

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { dshRef.current = dsh }, [dsh])
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { sessionStateRef.current = sessionState }, [sessionState])
  useEffect(() => { onTagsChangedRef.current = onTagsChanged }, [onTagsChanged])
  useEffect(() => () => { window.clearInterval(pollTimerRef.current) }, [])

  const stopPolling = useCallback(() => {
    window.clearInterval(pollTimerRef.current)
    pollTimerRef.current = undefined
    setSending(false)
  }, [])

  const mergeHistory = useCallback((entries: readonly HistoryEntry[]): ChatMessage[] => {
    const bySeq = new Map<number, ChatMessage>()
    for (const message of messagesRef.current) bySeq.set(message.seq, message)
    for (const entry of entries) {
      const event = entry.event
      if (event.type !== 'user/message' && event.type !== 'assistant/message') continue
      const raw = eventText(event)
      const text = event.type === 'user/message' ? displayUserText(raw) : raw
      if (text === '') continue
      bySeq.set(event.seq, { seq: event.seq, role: event.type === 'user/message' ? 'user' : 'assistant', text })
    }
    const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq)
    messagesRef.current = merged
    setMessages(merged)
    return merged
  }, [])

  const loadHistory = useCallback(async (id: string): Promise<HistoryEntry[]> => {
    const page = await dshRef.current.historyPage({ sessionId: id, maxMessages: 80 })
    return page.events
  }, [])

  // 恢复上次未关闭的 AI 助手会话（仅当模式匹配时），避免每次打开面板都新建会话。
  useEffect(() => {
    let cancelled = false
    try {
      const raw = globalThis.localStorage?.getItem(AI_SESSION_KEY)
      if (raw === null || raw === undefined) return
      const parsed = JSON.parse(raw) as { sessionId?: string; aiMode?: string }
      if (parsed.sessionId === undefined || parsed.sessionId === '' || parsed.aiMode !== settingsRef.current.aiMode) return
      sessionIdRef.current = parsed.sessionId
      setSessionId(parsed.sessionId)
      void loadHistory(parsed.sessionId).then((entries) => {
        if (cancelled) return
        mergeHistory(entries)
        setSeeded(entries.some(entry => entry.event.type === 'user/message' && eventText(entry.event).startsWith(SEED_MARKER)))
      }).catch(() => {
        // 会话已不存在或读取失败：忽略，下次发送时新建。
        sessionIdRef.current = null
        setSessionId(null)
      })
    } catch {
      // 存储不可用/损坏：忽略
    }
    return () => { cancelled = true }
  }, [loadHistory, mergeHistory])

  const applyModelSelection = useCallback(async (id: string): Promise<void> => {
    const s = settingsRef.current
    if (s.aiProvider === '' || s.aiModel === '') return
    await dshRef.current.selectModel({
      sessionId: id,
      provider: s.aiProvider,
      model: s.aiModel,
      ...(s.aiReasoningEffort === '' ? {} : { reasoningEffort: s.aiReasoningEffort }),
    })
  }, [])

  const poll = useCallback(async (id: string): Promise<void> => {
    pollCountRef.current += 1
    try {
      const entries = await loadHistory(id)
      const next = mergeHistory(entries)
      onTagsChangedRef.current()
      const userSeqs = next.filter(message => message.role === 'user').map(message => message.seq)
      const lastUserSeq = userSeqs.length === 0 ? 0 : Math.max(...userSeqs)
      const hasAssistantAfter = next.some(message => message.role === 'assistant' && message.seq > lastUserSeq)
      const running = sessionStateRef.current.byId[id]?.running ?? false
      if (pollCountRef.current >= 300) {
        stopPolling()
        return
      }
      if (!running && hasAssistantAfter) {
        stopPolling()
        return
      }
      if (!running && pollCountRef.current >= 20) {
        // 30 秒左右仍无回复：停止轮询，避免无限等待。
        stopPolling()
        return
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      stopPolling()
    }
  }, [loadHistory, mergeHistory, stopPolling])

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current !== null) return sessionIdRef.current
    const id = await dshRef.current.createSession({
      agentPreset: settingsRef.current.aiMode,
      cwd: settingsRef.current.aiWorkspace,
    })
    sessionIdRef.current = id
    setSessionId(id)
    try {
      // 登记为 helper 并归档，使其不出现在侧边栏/归档面板。
      await registerHelperSessionOnHost(id)
      addHelperSession(id)
      await archiveHelperSession(id)
    } catch (cause) {
      // host 尚未升级/接口不可用时不要阻断对话；本次会话暂时不隐藏，等重启后生效。
      try { await unregisterHelperSessionOnHost(id) } catch { /* 忽略清理失败 */ }
      removeHelperSession(id)
      console.warn('[dsh-archive-viewer] helper session setup skipped:', cause)
    }
    try {
      globalThis.localStorage?.setItem(AI_SESSION_KEY, JSON.stringify({ sessionId: id, aiMode: settingsRef.current.aiMode }))
    } catch {
      // 存储不可用时仅本次会话内复用
    }
    return id
  }, [])

  const handleSend = useCallback(async (): Promise<void> => {
    const text = input.trim()
    if (text === '' || sending) return
    setInput('')
    setError(null)
    try {
      const id = await ensureSession()
      await applyModelSelection(id)
      const instruction = seeded ? '' : buildInstruction(t, archiveRows)
      const content = instruction === '' ? text : `${instruction}${text}`
      await dshRef.current.prompt({ sessionId: id, text: content, mode: 'queue' })
      setSeeded(true)
      setSending(true)
      pollCountRef.current = 0
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = window.setInterval(() => { void poll(id) }, 1000)
      void poll(id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setSending(false)
    }
  }, [input, sending, seeded, t, archiveRows, ensureSession, applyModelSelection, poll])

  const handleNewChat = useCallback(async () => {
    const oldId = sessionIdRef.current
    window.clearInterval(pollTimerRef.current)
    pollTimerRef.current = undefined
    setError(null)
    if (oldId !== null) {
      try {
        await deleteHelperSessionOnHost(oldId)
        removeHelperSession(oldId)
      } catch (cause) {
        // 删除失败时不阻塞新对话；旧 helper id 保留在本地，归档面板仍会隐藏它。
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    }
    sessionIdRef.current = null
    setSessionId(null)
    setMessages([])
    messagesRef.current = []
    setSeeded(false)
    setSending(false)
    try {
      globalThis.localStorage?.removeItem(AI_SESSION_KEY)
    } catch {
      // 忽略
    }
  }, [])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void handleSend()
    }
  }, [handleSend])

  return (
    <div className="dsh-av-ai" data-expanded={expanded || undefined}>
      <div className="dsh-av-ai-head">
        <button
          type="button"
          className="dsh-av-ai-toggle"
          aria-expanded={expanded}
          onClick={() => { setExpanded(value => !value) }}
        >
          <span className="dsh-av-ai-title">{t('aiTitle')}</span>
          <span className="dsh-av-ai-mode">{settings.aiMode}</span>
          <span className="dsh-av-ai-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        </button>
        {expanded && (
          <button type="button" className="dsh-av-ai-new" disabled={sending} onClick={() => { void handleNewChat() }}>
            {t('aiNewChat')}
          </button>
        )}
      </div>
      {expanded && (
        <div className="dsh-av-ai-body">
          {error !== null && <div className="dsh-av-ai-error">{error}</div>}
          {messages.length === 0 && !sending && (
            <div className="dsh-av-ai-empty">{t('aiEmpty')}</div>
          )}
          <div className="dsh-av-ai-messages">
            {messages.map(message => (
              <div key={message.seq} className="dsh-av-ai-msg" data-role={message.role}>
                <span className="dsh-av-ai-msg-role">
                  {message.role === 'user' ? t('roleYou') : t('roleAssistant')}
                </span>
                <MessageText text={message.text} t={t} />
              </div>
            ))}
            {sending && <div className="dsh-av-ai-sending">{t('aiSending')}</div>}
          </div>
          <div className="dsh-av-ai-composer">
            <input
              type="text"
              className="dsh-av-ai-input"
              value={input}
              placeholder={t('aiPlaceholder')}
              aria-label={t('aiPlaceholder')}
              onChange={(event) => { setInput(event.target.value) }}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />
            <button
              type="button"
              className="dsh-av-ai-send"
              disabled={sending || input.trim() === ''}
              onClick={() => { void handleSend() }}
            >
              {t('aiSend')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
