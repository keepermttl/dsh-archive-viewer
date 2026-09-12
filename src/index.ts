/**
 * Host half of dsh-archive-viewer.
 *
 * 查看器本体在 browser 半区（src/client/），host 侧除了占位外，现在还负责
 * 归档会话标签的持久化：在 DSH profile 目录维护一个 JSON 文件，并通过本地
 * HTTP API（/api/archive-viewer/tags）暴露给浏览器 UI 与标准 DSH agent。
 * agent 可通过 curl 调用同一 API 来增删标签（包括隐藏的临时检索标签）。
 */
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** 一条会话事件的 wire 形状（DSH 日志事件，字段随事件类型而异）。 */
interface RawSessionEvent {
  type?: unknown
  seq?: unknown
  time?: unknown
  data?: unknown
}

/** 结构化最小 ctx（cordis Context 的可用子集），避免引入框架类型依赖。 */
interface HostContext {
  logger: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
  }
  webServer?: {
    register(route: {
      kind: 'exact'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }): () => void
  }
  /** 有界优雅退出请求（launcher 在插件挂载前提供；等价启动终端 Ctrl+C）。 */
  appExit?: (code: number) => void
  /** Profile 目录（file: URL 字符串），由 Loader 设置。 */
  baseUrl?: string
  /** 任意宿主服务读取（cordis Context#get；缺失服务返回 undefined）。 */
  get?(name: string): unknown
  /**
   * DSH workspace 注册表。官方目前只提供 archiveSession（单向归档），
   * 取消归档在旧版本由本插件的 core 补丁提供；新版改为运行时适配：
   *  - 若注册表自身提供 unarchiveSession（补丁已应用/官方后续合入）→ 直接用；
   *  - 否则用注册表自己的提交路径 setState 写回归档集合（保留其状态缓存与
   *    domain/changed 事件，从而让所有客户端实时看到归档集合变化）。
   */
  workspaceRegistry?: {
    archivedSessionIds: readonly string[]
    archiveSession?(sessionId: string): Promise<void>
    unarchiveSession?(sessionId: string): Promise<void>
    setState?(state: unknown): Promise<void>
    /** 注册表自己的写操作链（官方 create/delete/archive 都串行在这里）。 */
    enqueueOperation?<T>(operation: () => Promise<T>): Promise<T>
    /** domain global 句柄：`get()` 返回最新已提交状态。 */
    global?: { get?(): unknown }
    state?: unknown
    list?(): readonly { id: unknown }[]
  }
  effect?: (callback: () => (() => void) | void, label?: string) => void
}

/** Stable Cordis plugin name（loader 行 id 由 cordis.patch.yml 的 insert 决定）。 */
export const name = 'archive-viewer'

/**
 * 依赖的宿主服务。只声明 webServer：appExit 是 launcher 提供的可选宿主值
 * （缺失时只是「关闭 dsh」按钮返回失败，不应该让整个插件的 fiber 停摆），
 * 其余宿主服务（sessionQuery / workspaceRegistry）一律用 ctx.get 惰性读取。
 */
export const inject = ['webServer']

/** 标签库文件名（放在 profile 目录下，agent 也可直接读取）。 */
const TAGS_FILENAME = 'dsh-archive-viewer-tags.json'

/** 隐藏临时检索标签。UI 不把它显示为普通会话徽章，只在筛选区显示特殊开关。 */
export const HIDDEN_TAG = 'agent检索'

interface TagStore {
  version: 1
  tags: Record<string, string[]>
}

const EMPTY_STORE: TagStore = { version: 1, tags: {} }

/** 规范化一个标签：去首尾空白、合并连续空白、拒绝空串/超长。 */
function normalizeTag(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const tag = value.trim().replace(/\s+/g, ' ')
  if (tag === '' || tag.length > 50) return null
  return tag
}

function normalizeTags(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  for (const value of values) {
    const tag = normalizeTag(value)
    if (tag !== null && !out.includes(tag)) out.push(tag)
  }
  return out
}

/** 从 ctx.baseUrl 解析 profile 绝对目录。 */
function dataDirOf(ctx: HostContext): string | undefined {
  if (ctx.baseUrl === undefined) return undefined
  try {
    return fileURLToPath(new URL('.', ctx.baseUrl))
  } catch {
    return undefined
  }
}

async function readStore(filePath: string): Promise<TagStore> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<TagStore>
    if (
      parsed !== null
      && typeof parsed === 'object'
      && parsed.tags !== undefined
      && typeof parsed.tags === 'object'
      && !Array.isArray(parsed.tags)
    ) {
      const tags: Record<string, string[]> = {}
      for (const [id, list] of Object.entries(parsed.tags)) {
        if (id === '' || !Array.isArray(list)) continue
        const clean = normalizeTags(list)
        if (clean.length > 0) tags[id] = clean
      }
      return { version: 1, tags }
    }
  } catch {
    // 文件缺失/损坏时按空库处理
  }
  return EMPTY_STORE
}

async function writeStore(filePath: string, store: TagStore): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}

/** 每个文件一条写队列，避免并发读改写互相覆盖。 */
const writeQueues = new Map<string, Promise<unknown>>()

function enqueueWrite<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(filePath) ?? Promise.resolve()
  const next = prev.then(task, task)
  writeQueues.set(filePath, next.catch(() => undefined))
  return next
}

async function mutateStore(
  filePath: string,
  mutate: (current: TagStore) => TagStore,
): Promise<TagStore> {
  return enqueueWrite(filePath, async () => {
    const current = await readStore(filePath)
    const next = mutate(current)
    await writeStore(filePath, next)
    return next
  })
}

/** AI 助手会话登记文件名（只有登记过的会话才允许被安全删除）。 */
const HELPER_SESSIONS_FILENAME = 'dsh-archive-viewer-helper-sessions.json'

interface HelperStore {
  version: 1
  ids: string[]
}

async function readHelperStore(filePath: string): Promise<HelperStore> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<HelperStore>
    if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.ids)) {
      const ids = parsed.ids.filter((id): id is string => typeof id === 'string' && id !== '')
      return { version: 1, ids: [...new Set(ids)] }
    }
  } catch {
    // 缺失/损坏按空处理
  }
  return { version: 1, ids: [] }
}

async function writeHelperStore(filePath: string, store: HelperStore): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}

async function mutateHelperStore(
  filePath: string,
  mutate: (current: HelperStore) => HelperStore,
): Promise<HelperStore> {
  return enqueueWrite(filePath, async () => {
    const current = await readHelperStore(filePath)
    const next = mutate(current)
    await writeHelperStore(filePath, next)
    return next
  })
}

/** DSH sessions 根目录（~/.dsh/sessions，从 profile 目录向上两级推导）。 */
function sessionsRootOf(ctx: HostContext): string | undefined {
  if (ctx.baseUrl === undefined) return undefined
  try {
    const home = fileURLToPath(new URL('../../', ctx.baseUrl))
    return join(home, 'sessions')
  } catch {
    return undefined
  }
}

/** 在 sessions 根目录下递归查找指定 sessionId 的目录。 */
async function findSessionDir(root: string, sessionId: string): Promise<string | undefined> {
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const entry of entries) {
    if (entry.name === sessionId && entry.isDirectory()) return join(root, entry.name)
    if (entry.isDirectory()) {
      const found = await findSessionDir(join(root, entry.name), sessionId)
      if (found !== undefined) return found
    }
  }
  return undefined
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** 读取宿主提供的值（如 appExit）；未声明 inject 的属性访问会抛错，故只走 ctx.get。 */
function hostValueOf<T>(ctx: HostContext, name: string): T | undefined {
  if (typeof ctx.get !== 'function') return undefined
  try {
    return ctx.get(name) as T | undefined
  } catch {
    return undefined
  }
}

/**
 * 本机同源守卫：这些路由绕过官方 /api 的信任栅栏与浏览器会话认证，只应服务
 * 本机页面。Host 必须是环回地址；带 Origin 时必须是同源（挡掉跨站表单/脚本
 * 对本地端口的 CSRF）。
 */
function isLocalSameOriginRequest(req: IncomingMessage): boolean {
  const rawHost = req.headers.host
  if (typeof rawHost !== 'string' || rawHost === '') return false
  const hostname = rawHost.startsWith('[')
    ? rawHost.slice(1, rawHost.indexOf(']'))
    : rawHost.slice(0, rawHost.includes(':') ? rawHost.indexOf(':') : rawHost.length)
  if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '::1') return false
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '' || origin === 'null') return true
  try {
    return new URL(origin).host === rawHost
  } catch {
    return false
  }
}

/** 读取请求体 JSON；失败返回 undefined（调用方回 400）。 */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const body = await readBody(req)
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

/** 只有这两类事件是「对话消息」。 */
const CHAT_TYPES = new Set(['user/message', 'assistant/message'])

/**
 * 原始 JSONL 读取的超时上限（毫秒）。jsonl 后端在「读期间文件又被追加」时会
 * 重试以避开半行，正在写日志的活跃会话可能长时间不返回。
 */
const RAW_READ_TIMEOUT_MS = 8_000

/** 内容扫描时的读取超时（更短：一次扫几百段会话，个别慢会话不值得等）。 */
const CONTENT_SCAN_READ_TIMEOUT_MS = 4_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 从一条会话事件里取可读文本。
 *
 * 事件数据形状随 DSH 版本变化，这里同时兼容三种已知形状：
 *  - `data.text`（早期扁平形状）；
 *  - `data.content[]`（user/message：UserMessage 本体）；
 *  - `data.message.content[]`（assistant/message：{turn, step, message} 包装）。
 * 非文本块（图片/工具结果等）折叠成 `[type]` 占位符，保持旧面板的观感。
 */
function chatTextOf(data: unknown): string {
  if (!isRecord(data)) return ''
  if (typeof data.text === 'string' && data.text !== '') return data.text
  let content: unknown = data.content
  if (!Array.isArray(content) && isRecord(data.message)) content = data.message.content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!isRecord(block)) continue
    if (block.type === 'text' && typeof block.text === 'string') {
      if (block.text !== '') parts.push(block.text)
      continue
    }
    if (typeof block.type === 'string' && block.type !== '') parts.push(`[${block.type}]`)
  }
  return parts.join('\n')
}

/** 归一化后的对话消息（分页与内容搜索的共同单位）。 */
interface ChatMessage {
  seq: number
  time: number
  type: 'user/message' | 'assistant/message'
  text: string
}

/** 读取 session-query 服务（冷会话日志读取挂在它上面）。 */
function sessionQueryOf(ctx: HostContext): {
  readSession?(id: string): Promise<{ events?: readonly RawSessionEvent[] }>
} | undefined {
  return hostValueOf<{
    readSession?(id: string): Promise<{ events?: readonly RawSessionEvent[] }>
  }>(ctx, 'sessionQuery')
}

/** 把 JSONL 日志文本逐行解析成对话消息（跳过头部行与打包 chunk 行）。 */
function chatMessagesFromJsonl(content: string): ChatMessage[] {
  const messages: ChatMessage[] = []
  let at = 0
  while (at < content.length) {
    let end = content.indexOf('\n', at)
    if (end === -1) end = content.length
    const line = content.slice(at, end)
    at = end + 1
    if (line === '') continue
    let record: unknown
    try {
      record = JSON.parse(line)
    } catch {
      continue
    }
    if (!isRecord(record)) continue
    const type = record.type
    if (typeof type !== 'string' || !CHAT_TYPES.has(type)) continue
    const seq = typeof record.seq === 'number' ? record.seq : messages.length
    const time = typeof record.time === 'number' ? record.time : 0
    const text = chatTextOf(record.data)
    if (text === '') continue
    messages.push({ seq, time, type: type as ChatMessage['type'], text })
  }
  return messages
}

/**
 * 读取一段会话的对话消息（冷/热会话都可读，不激活 Agent）。
 *
 * 快路径：持久化后端的原始 JSONL（`sessionPersistence.readRaw`，已解压的
 * 逐行事件文本）——只做 `JSON.parse` + 过滤，不做重放校验；实测比
 * `sessionQuery.readSession`（整段重放 + schema 校验）快一到两个数量级，
 * 对几 MB 的日志从 ~20s 降到亚秒级（live 会话的落盘延迟 ≤200ms，不影响轮询）。
 *
 * 注意：jsonl 后端的 readRaw 会在「读文件期间文件被追加」时重试，保证不读到
 * 半行。正在写日志的活跃会话（尤其是当前会话）可能因此长时间不返回，故给
 * 原始读取加超时上限；超时后回退到 live-preferred 的 sessionQuery 路径。
 *
 * @param ctx - host 插件上下文。
 * @param sessionId - 目标会话。
 * @param rawTimeoutMs - 原始 JSONL 读取的超时上限（毫秒）。
 * @returns 归一化的对话消息（seq 升序）。
 */
async function readChatMessages(
  ctx: HostContext,
  sessionId: string,
  rawTimeoutMs = RAW_READ_TIMEOUT_MS,
): Promise<ChatMessage[]> {
  const persistence = hostValueOf<{
    supportsRawArtifacts?: boolean
    readRaw?(id: string, signal?: AbortSignal): Promise<{ content?: string } | undefined>
  }>(ctx, 'sessionPersistence')
  if (persistence?.supportsRawArtifacts === true && typeof persistence.readRaw === 'function') {
    try {
      const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(rawTimeoutMs) : undefined
      const artifact = await persistence.readRaw(sessionId, signal)
      if (artifact !== undefined && typeof artifact.content === 'string') {
        return chatMessagesFromJsonl(artifact.content)
      }
    } catch {
      // 超时/后端不支持/文件缺失 → 落到 sessionQuery 路径
    }
  }
  const query = sessionQueryOf(ctx)
  if (query === undefined || typeof query.readSession !== 'function') {
    throw new Error('no session log reader is available on this host (sessionPersistence/sessionQuery)')
  }
  const snapshot = await query.readSession(sessionId)
  const events = Array.isArray(snapshot?.events) ? snapshot.events : []
  const messages: ChatMessage[] = []
  for (const event of events) {
    if (!isRecord(event)) continue
    const type = event.type
    if (typeof type !== 'string' || !CHAT_TYPES.has(type)) continue
    const seq = typeof event.seq === 'number' ? event.seq : messages.length
    const time = typeof event.time === 'number' ? event.time : 0
    const text = chatTextOf(event.data)
    if (text === '') continue
    messages.push({ seq, time, type: type as ChatMessage['type'], text })
  }
  return messages
}

/**
 * 内容检索的一段会话命中数：读该会话的消息并统计命中条数，窗口由
 * `maxMessages`（＝面板「每会话扫描页数」× 每页消息数）从尾部截取。
 * 读不到（超时/日志缺失）按 0 计，不打断整体扫描。
 */
async function countContentMatches(
  ctx: HostContext,
  sessionId: string,
  keyword: string,
  maxMessages: number,
): Promise<number> {
  const messages = await readChatMessages(ctx, sessionId, CONTENT_SCAN_READ_TIMEOUT_MS)
  const window = messages.slice(Math.max(0, messages.length - maxMessages))
  const needle = keyword.toLowerCase()
  let matches = 0
  for (const message of window) {
    if (message.text.toLowerCase().includes(needle)) matches += 1
  }
  return matches
}

/** 归一化消息 → 面板消费的 history 条目形状（与旧 session.history RPC 信封一致）。 */
function toHistoryEntry(message: ChatMessage): { event: { seq: number; time: number; type: string; data: { text: string; content: { type: 'text'; text: string }[] } } } {
  return {
    event: {
      seq: message.seq,
      time: message.time,
      type: message.type,
      data: { text: message.text, content: [{ type: 'text', text: message.text }] },
    },
  }
}

/**
 * 读取 workspace 注册表。
 *
 * cordis 里未在 `inject` 中声明的服务不能用属性访问（会抛
 * `cannot get property "..." without inject`），而把 workspaceRegistry 写进
 * `inject` 会让插件在缺少它的宿主上直接停摆；这里统一走 `ctx.get`。
 */
function registryOf(ctx: HostContext): NonNullable<HostContext['workspaceRegistry']> | undefined {
  const viaGet = hostValueOf<NonNullable<HostContext['workspaceRegistry']>>(ctx, 'workspaceRegistry')
  if (viaGet !== undefined) return viaGet
  try {
    return ctx.workspaceRegistry
  } catch {
    return undefined
  }
}

/**
 * 取消归档一个会话（把 id 从注册表全局归档集合移除）。
 *
 * 官方 registry 目前只有 archiveSession（单向）。优先调用注册表自己的
 * unarchiveSession（core 补丁已应用或官方后续合入时自动生效）；否则走它自己的
 * 读-改-写路径：
 *  - 先取最新已提交状态（`global.get()`，回退 registry 缓存的状态对象），只替换
 *    `archivedSessionIds`，保留未知字段；
 *  - 整个读-改-写放进注册表自己的操作链 `enqueueOperation`，与官方
 *    create/delete/archive 串行，避免与并发归档互相覆盖（丢更新）；
 *  - 写后校验：目标已移除、其余 id 与本意一致，否则重试。
 * 写入落在 domain global 上，会触发 domain/changed → workspace feed → 所有
 * 客户端实时更新归档集合。
 */
async function unarchiveSessionOnRegistry(
  ctx: HostContext,
  sessionId: string,
): Promise<readonly string[]> {
  const registry = registryOf(ctx)
  if (registry === undefined) throw new Error('workspaceRegistry is unavailable on this host')
  if (!registry.archivedSessionIds.includes(sessionId)) {
    return [...registry.archivedSessionIds]
  }
  if (typeof registry.unarchiveSession === 'function') {
    await registry.unarchiveSession(sessionId)
    return [...registry.archivedSessionIds]
  }
  const setState = registry.setState
  if (typeof setState !== 'function') {
    throw new Error('workspace registry exposes neither unarchiveSession nor setState')
  }
  const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
    left.length === right.length && left.every((id, index) => id === right[index])

  const commit = async (): Promise<readonly string[] | undefined> => {
    const state = freshRegistryState(registry)
    if (state === undefined) {
      throw new Error('workspace registry state is not readable (unsupported DSH build)')
    }
    const before = state.archivedSessionIds as readonly string[]
    if (!before.includes(sessionId)) return [...registry.archivedSessionIds]
    const expected = before.filter(id => id !== sessionId)
    await setState.call(registry, { ...state, archivedSessionIds: expected })
    const after = registry.archivedSessionIds
    if (!after.includes(sessionId) && sameIds(after, expected)) return [...after]
    return undefined
  }

  const enqueue = registry.enqueueOperation
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result: readonly string[] | undefined = typeof enqueue === 'function'
      ? await (enqueue.call(registry, commit) as Promise<readonly string[] | undefined>)
      : await commit()
    if (result !== undefined) return result
  }
  throw new Error('workspace archive set did not converge after 3 attempts')
}

/** 取注册表最新已提交状态：优先 domain global 的当前值，回退其缓存状态对象。 */
function freshRegistryState(
  registry: NonNullable<HostContext['workspaceRegistry']>,
): Record<string, unknown> | undefined {
  const globalStore = registry.global
  if (globalStore !== undefined && typeof globalStore.get === 'function') {
    const value = globalStore.get()
    if (isRecord(value) && Array.isArray(value.archivedSessionIds)) return value
  }
  const cached = registry.state
  if (isRecord(cached) && Array.isArray(cached.archivedSessionIds)) return cached
  return undefined
}

/** 归档一个会话（helper 会话隐藏用）：官方 registry.archiveSession 是稳定公开 API。 */
async function archiveSessionOnRegistry(ctx: HostContext, sessionId: string): Promise<readonly string[]> {
  const registry = registryOf(ctx)
  if (registry === undefined) throw new Error('workspaceRegistry is unavailable on this host')
  if (registry.archivedSessionIds.includes(sessionId)) return [...registry.archivedSessionIds]
  if (typeof registry.archiveSession !== 'function') {
    throw new Error('workspace registry exposes no archiveSession')
  }
  await registry.archiveSession(sessionId)
  return [...registry.archivedSessionIds]
}

/**
 * Mount the host half.
 * @param ctx - host plugin context.
 */
export function apply(ctx: HostContext): void {
  if (ctx.webServer === undefined) {
    ctx.logger.warn('[dsh-archive-viewer] host half skipped tag API: webServer unavailable')
    return
  }
  const dir = dataDirOf(ctx)
  if (dir === undefined) {
    ctx.logger.warn('[dsh-archive-viewer] host half skipped tag API: baseUrl unavailable')
    return
  }
  const filePath = join(dir, TAGS_FILENAME)
  const disposer = ctx.webServer.register({
    kind: 'exact',
    path: '/api/archive-viewer/tags',
    handler: async (req, res) => {
      try {
        if (req.method === 'GET') {
          const store = await readStore(filePath)
          sendJson(res, 200, { ok: true, tags: store.tags, hiddenTag: HIDDEN_TAG })
          return
        }
        if (req.method === 'POST') {
          const body = await readBody(req)
          let payload: unknown
          try {
            payload = JSON.parse(body)
          } catch {
            sendJson(res, 400, { ok: false, error: 'invalid-json' })
            return
          }
          const p = (payload ?? {}) as {
            sessionId?: unknown
            add?: unknown
            remove?: unknown
            clearHidden?: unknown
          }
          if (p.clearHidden === true) {
            const store = await mutateStore(filePath, (current) => {
              const tags: Record<string, string[]> = {}
              for (const [id, list] of Object.entries(current.tags)) {
                const filtered = list.filter(tag => tag !== HIDDEN_TAG)
                if (filtered.length > 0) tags[id] = filtered
              }
              return { version: 1, tags }
            })
            sendJson(res, 200, { ok: true, tags: store.tags, hiddenTag: HIDDEN_TAG })
            return
          }
          if (typeof p.sessionId !== 'string' || p.sessionId === '') {
            sendJson(res, 400, { ok: false, error: 'missing-session-id' })
            return
          }
          const sessionId: string = p.sessionId
          const add = normalizeTags(p.add)
          const remove = normalizeTags(p.remove)
          if (add.length === 0 && remove.length === 0) {
            sendJson(res, 400, { ok: false, error: 'nothing-to-change' })
            return
          }
          const store = await mutateStore(filePath, (current) => {
            const list = [...(current.tags[sessionId] ?? [])]
            for (const tag of remove) {
              const at = list.indexOf(tag)
              if (at !== -1) list.splice(at, 1)
            }
            for (const tag of add) {
              if (!list.includes(tag)) list.push(tag)
            }
            const next: TagStore = { version: 1, tags: { ...current.tags } }
            if (list.length === 0) delete next.tags[sessionId]
            else next.tags[sessionId] = list
            return next
          })
          sendJson(res, 200, { ok: true, tags: store.tags[sessionId] ?? [], hiddenTag: HIDDEN_TAG })
          return
        }
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
      } catch (error) {
        ctx.logger.error('[dsh-archive-viewer] tag API error:', error)
        sendJson(res, 500, { ok: false, error: 'internal' })
      }
    },
  })
  const helperFilePath = join(dir, HELPER_SESSIONS_FILENAME)

  const helperDisposer = ctx.webServer.register({
    kind: 'exact',
    path: '/api/archive-viewer/helper-sessions',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
          return
        }
        const body = await readBody(req)
        let payload: unknown
        try {
          payload = JSON.parse(body)
        } catch {
          sendJson(res, 400, { ok: false, error: 'invalid-json' })
          return
        }
        const p = (payload ?? {}) as { sessionId?: unknown; action?: unknown }
        if (typeof p.sessionId !== 'string' || p.sessionId === '') {
          sendJson(res, 400, { ok: false, error: 'missing-session-id' })
          return
        }
        if (p.action !== 'add' && p.action !== 'remove') {
          sendJson(res, 400, { ok: false, error: 'invalid-action' })
          return
        }
        const sessionId: string = p.sessionId
        const store = await mutateHelperStore(helperFilePath, (current) => {
          const ids = new Set(current.ids)
          if (p.action === 'add') ids.add(sessionId)
          else ids.delete(sessionId)
          return { version: 1, ids: [...ids] }
        })
        sendJson(res, 200, { ok: true, ids: store.ids })
      } catch (error) {
        ctx.logger.error('[dsh-archive-viewer] helper-sessions API error:', error)
        sendJson(res, 500, { ok: false, error: 'internal' })
      }
    },
  })

  /** 右上角「关闭 dsh」按钮的宿主端：客户端 POST /api/host.shutdown（client-request 信封）。
   * 当前官方 core（rc.8+）不再提供 host.shutdown RPC，端点由本插件补齐：校验信封后先回
   * ok 响应（进程可能随即退出），再调用 ctx.appExit(0) —— launcher 接的有界优雅退出
   * （5 秒宽限，等价在启动终端按 Ctrl+C）。仅监听 127.0.0.1，与其余本地 API 同级。 */
  const shutdownDisposer = ctx.webServer.register({
    kind: 'exact',
    path: '/api/host.shutdown',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { type: 'server-response', rpcId: 'unknown', result: { ok: false, error: { message: 'POST required' } } })
          return
        }
        const body = await readBody(req)
        let payload: unknown
        try {
          payload = JSON.parse(body)
        } catch {
          sendJson(res, 400, { type: 'server-response', rpcId: 'invalid', result: { ok: false, error: { message: 'invalid-json' } } })
          return
        }
        const p = (payload ?? {}) as { rpcId?: unknown; method?: unknown }
        const rpcId = typeof p.rpcId === 'string' && p.rpcId !== '' ? p.rpcId : 'unknown'
        if (p.method !== 'host.shutdown') {
          sendJson(res, 400, { type: 'server-response', rpcId, result: { ok: false, error: { message: 'unknown method' } } })
          return
        }
        sendJson(res, 200, { type: 'server-response', rpcId, result: { ok: true, value: {} } })
        // 响应已 flush 后再请求退出，避免进程先于响应离开。
        // appExit 是 launcher 提供的宿主值（可选）：缺失时按钮报错而非拖垮插件。
        const exit = hostValueOf<(code: number) => void>(ctx, 'appExit')
        setTimeout(() => {
          try {
            if (exit === undefined) {
              ctx.logger.warn('[dsh-archive-viewer] host.shutdown: no appExit host value; nothing to do')
              return
            }
            exit(0)
          } catch {
            // exit 请求失败不影响已返回的响应
          }
        }, 30)
      } catch (error) {
        ctx.logger.error('[dsh-archive-viewer] host.shutdown API error:', error)
        sendJson(res, 500, { type: 'server-response', rpcId: 'unknown', result: { ok: false, error: { message: 'internal' } } })
      }
    },
  })

  const deleteDisposer = ctx.webServer.register({
    kind: 'exact',
    path: '/api/archive-viewer/session/delete',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
          return
        }
        const body = await readBody(req)
        let payload: unknown
        try {
          payload = JSON.parse(body)
        } catch {
          sendJson(res, 400, { ok: false, error: 'invalid-json' })
          return
        }
        const p = (payload ?? {}) as { sessionId?: unknown }
        if (typeof p.sessionId !== 'string' || p.sessionId === '') {
          sendJson(res, 400, { ok: false, error: 'missing-session-id' })
          return
        }
        const sessionId: string = p.sessionId

        // 安全门：只允许删除本插件登记过的 AI 助手会话，避免误删用户归档/普通会话。
        const helperStore = await readHelperStore(helperFilePath)
        if (!helperStore.ids.includes(sessionId)) {
          sendJson(res, 403, { ok: false, error: 'not-helper-session' })
          return
        }

        // 如果该 helper 会话处于归档集合，先取消归档，避免留下悬空归档 id。
        const registry = registryOf(ctx)
        if (registry !== undefined && registry.archivedSessionIds.includes(sessionId)) {
          await unarchiveSessionOnRegistry(ctx, sessionId)
        }

        // 删除磁盘上的会话目录（~/.dsh/sessions 下按 sessionId 精确匹配）。
        const sessionsRoot = sessionsRootOf(ctx)
        if (sessionsRoot !== undefined) {
          const sessionDir = await findSessionDir(sessionsRoot, sessionId)
          if (sessionDir !== undefined) {
            await fs.rm(sessionDir, { recursive: true, force: true })
          }
        }

        await mutateHelperStore(helperFilePath, (current) => ({
          version: 1,
          ids: current.ids.filter(id => id !== sessionId),
        }))
        sendJson(res, 200, { ok: true })
      } catch (error) {
        ctx.logger.error('[dsh-archive-viewer] session.delete API error:', error)
        sendJson(res, 500, { ok: false, error: 'internal' })
      }
    },
  })

  /**
   * 会话日志分页读取。
   *
   * 旧版客户端用官方 `session.history` RPC 读日志；新版 DSH 的 unary RPC 只剩
   * `session/page`（需要调用方先拿到 follow 流的 throughSeq），故改为由本插件
   * 宿主半区用 `ctx.sessionQuery.readSession`（冷/热会话都可读，不激活 Agent）
   * 直接读日志，并把事件折叠成面板消费的消息形状返回。
   * 请求：{ sessionId, beforeSeq?, maxMessages? }
   * 响应：{ ok, events: [{ event: { seq, time, type, data: { text } } }], hasMore, nextBeforeSeq }
   */
  const historyDisposer = ctx.webServer.register({
    kind: 'exact',
    path: '/api/archive-viewer/history',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
          return
        }
        if (!isLocalSameOriginRequest(req)) {
          sendJson(res, 403, { ok: false, error: 'forbidden' })
          return
        }
        const payload = await readJsonBody(req)
        if (payload === undefined) {
          sendJson(res, 400, { ok: false, error: 'invalid-json' })
          return
        }
        const p = (payload ?? {}) as { sessionId?: unknown; beforeSeq?: unknown; maxMessages?: unknown }
        if (typeof p.sessionId !== 'string' || p.sessionId === '') {
          sendJson(res, 400, { ok: false, error: 'missing-session-id' })
          return
        }
        const maxMessages = typeof p.maxMessages === 'number' && Number.isSafeInteger(p.maxMessages) && p.maxMessages > 0
          ? Math.min(p.maxMessages, 500)
          : 20
        const beforeSeq = typeof p.beforeSeq === 'number' && Number.isSafeInteger(p.beforeSeq) ? p.beforeSeq : undefined
        const sessionId: string = p.sessionId

        const messages = await readChatMessages(ctx, sessionId)
        // beforeSeq = 本页最后一页之前的排他上界（向前翻页游标）。
        let end = messages.length
        if (beforeSeq !== undefined) {
          const at = messages.findIndex(message => message.seq >= beforeSeq)
          end = at === -1 ? messages.length : at
        }
        const start = Math.max(0, end - maxMessages)
        const page = messages.slice(start, end)
        sendJson(res, 200, {
          ok: true,
          events: page.map(toHistoryEntry),
          hasMore: start > 0,
          nextBeforeSeq: page.length > 0 ? page[0]?.seq : undefined,
        })
      } catch (error) {
        ctx.logger.error('[dsh-archive-viewer] history API error:', error)
        sendJson(res, 500, {
          ok: false,
          error: 'history-unavailable',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })

  /**
   * 单会话对话内容检索（「内容」搜索模式）：宿主侧一次读日志、计数命中，
   * 免得浏览器为每页关键词命中反复往返。请求：{ sessionId, keyword, maxMessages? }
   * 响应：{ ok, matches }
   */
  const contentSearchDisposer = ctx.webServer.register({
    kind: 'exact',
    path: '/api/archive-viewer/content-search',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
          return
        }
        if (!isLocalSameOriginRequest(req)) {
          sendJson(res, 403, { ok: false, error: 'forbidden' })
          return
        }
        const payload = await readJsonBody(req)
        if (payload === undefined) {
          sendJson(res, 400, { ok: false, error: 'invalid-json' })
          return
        }
        const p = (payload ?? {}) as { sessionId?: unknown; keyword?: unknown; maxMessages?: unknown }
        if (typeof p.sessionId !== 'string' || p.sessionId === '') {
          sendJson(res, 400, { ok: false, error: 'missing-session-id' })
          return
        }
        const keyword = typeof p.keyword === 'string' ? p.keyword.trim().toLowerCase() : ''
        if (keyword === '') {
          sendJson(res, 200, { ok: true, matches: 0 })
          return
        }
        const maxMessages = typeof p.maxMessages === 'number' && Number.isSafeInteger(p.maxMessages) && p.maxMessages > 0
          ? Math.min(p.maxMessages, 2000)
          : 100
        const matches = await countContentMatches(ctx, p.sessionId, keyword, maxMessages)
        sendJson(res, 200, { ok: true, matches })
      } catch (error) {
        ctx.logger.error('[dsh-archive-viewer] content-search API error:', error)
        sendJson(res, 500, {
          ok: false,
          error: 'history-unavailable',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })

  /**
   * 取消归档（「恢复会话」）：官方 registry 只有单向归档，这里由宿主半区补齐。
   * 写入走 domain global 提交，会触发 domain/changed，所有客户端实时更新。
   */
  const unarchiveDisposer = ctx.webServer.register({
    kind: 'exact',
    path: '/api/archive-viewer/unarchive',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
          return
        }
        if (!isLocalSameOriginRequest(req)) {
          sendJson(res, 403, { ok: false, error: 'forbidden' })
          return
        }
        const payload = await readJsonBody(req)
        if (payload === undefined) {
          sendJson(res, 400, { ok: false, error: 'invalid-json' })
          return
        }
        const p = (payload ?? {}) as { sessionId?: unknown }
        if (typeof p.sessionId !== 'string' || p.sessionId === '') {
          sendJson(res, 400, { ok: false, error: 'missing-session-id' })
          return
        }
        const archivedSessionIds = await unarchiveSessionOnRegistry(ctx, p.sessionId)
        sendJson(res, 200, { ok: true, archivedSessionIds })
      } catch (error) {
        ctx.logger.error('[dsh-archive-viewer] unarchive API error:', error)
        sendJson(res, 500, {
          ok: false,
          error: 'unarchive-unavailable',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })

  /** 归档（AI 助手会话隐藏用）：官方 registry.archiveSession 的宿主直通。 */
  const archiveDisposer = ctx.webServer.register({
    kind: 'exact',
    path: '/api/archive-viewer/archive',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
          return
        }
        if (!isLocalSameOriginRequest(req)) {
          sendJson(res, 403, { ok: false, error: 'forbidden' })
          return
        }
        const payload = await readJsonBody(req)
        if (payload === undefined) {
          sendJson(res, 400, { ok: false, error: 'invalid-json' })
          return
        }
        const p = (payload ?? {}) as { sessionId?: unknown }
        if (typeof p.sessionId !== 'string' || p.sessionId === '') {
          sendJson(res, 400, { ok: false, error: 'missing-session-id' })
          return
        }
        const archivedSessionIds = await archiveSessionOnRegistry(ctx, p.sessionId)
        sendJson(res, 200, { ok: true, archivedSessionIds })
      } catch (error) {
        ctx.logger.error('[dsh-archive-viewer] archive API error:', error)
        sendJson(res, 500, {
          ok: false,
          error: 'archive-unavailable',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })

  if (ctx.effect !== undefined) {
    // cordis 的 effect 会立即执行回调并把返回值当作销毁函数；这里必须返回
    // 一个组合 disposer，而不是直接调用三个 disposer（否则路由注册后立刻被注销）。
    ctx.effect(() => () => {
      disposer()
      helperDisposer()
      deleteDisposer()
      shutdownDisposer()
      historyDisposer()
      contentSearchDisposer()
      unarchiveDisposer()
      archiveDisposer()
    }, 'dsh-archive-viewer: local API routes')
  }
  ctx.logger.info(`[dsh-archive-viewer] host half loaded; tag store: ${filePath}`)
}
