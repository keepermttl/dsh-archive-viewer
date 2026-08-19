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
  /** Profile 目录（file: URL 字符串），由 Loader 设置。 */
  baseUrl?: string
  /** DSH workspace 注册表（用于把 helper 会话从归档集合中移除）。 */
  workspaceRegistry?: {
    archivedSessionIds: readonly string[]
    unarchiveSession(sessionId: string): Promise<void>
  }
  effect?: (callback: () => (() => void) | void, label?: string) => void
}

/** Stable Cordis plugin name（loader 行 id 由 cordis.patch.yml 的 insert 决定）。 */
export const name = 'archive-viewer'

/** 依赖的宿主服务：读取 ctx.webServer 前必须声明，否则 cordis fiber 会拒绝注入。 */
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
        if (ctx.workspaceRegistry !== undefined
          && ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) {
          await ctx.workspaceRegistry.unarchiveSession(sessionId)
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

  if (ctx.effect !== undefined) {
    // cordis 的 effect 会立即执行回调并把返回值当作销毁函数；这里必须返回
    // 一个组合 disposer，而不是直接调用三个 disposer（否则路由注册后立刻被注销）。
    ctx.effect(() => () => {
      disposer()
      helperDisposer()
      deleteDisposer()
    }, 'dsh-archive-viewer: local API routes')
  }
  ctx.logger.info(`[dsh-archive-viewer] host half loaded; tag store: ${filePath}`)
}
