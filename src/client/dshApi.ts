/**
 * DSH 数据访问层（适配当前 DSH 客户端/宿主 API）。
 *
 * 本模块把面板需要的全部后端能力收敛到一处，屏蔽版本差异：
 *
 *  1) 插件自己的宿主路由（`/api/archive-viewer/*`）——日志分页、内容检索、
 *     归档/取消归档。这些路由由本插件宿主半区提供，不受官方 RPC 改名影响。
 *  2) 官方 unary RPC——AI 助手需要的 session/create、session/prompt、
 *     session/selectModel，以及设置面板的模型目录与 agent preset 列表。
 *     优先走官方客户端命名空间服务（`ctx.get('remote.session')` 等，
 *     参数映射由官方描述符负责），服务不可用时回退到当前线协议：
 *     `POST /api/<namespace>/<method>`，信封
 *     `{ type:'client-request', rpcId, method, payload:{ args } }`。
 *
 * 回退路径还会在 `gateway/arguments-invalid` 报出 `missing "X"` 时按提示改名
 * 重试一次（官方 RPC 的参数 wire 名是生成描述符决定的，例如 session/list 的
 * 参数名是 `_request`），使插件不会因为一次参数改名整体失效。
 */
import type {
  AgentPresetRow, ChatHistoryPage, HistoryEntry, ModelCatalog, RemoteResult, SessionId,
} from './types.ts'

/** 官方网关的 unary RPC 前缀（API_PATH）。 */
const API_PATH = '/api'

interface ChatMessageWire {
  event: { seq: number; time: number; type: string; data: { text: string } }
}

function originOf(): string {
  const origin = globalThis.location?.origin
  return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'
}

function urlOf(path: string, query?: Record<string, string>): string {
  const url = new URL(path, originOf())
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
  return url.toString()
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text === '') return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { parseError: text.slice(0, 200) }
  }
}

function messageOf(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const record = payload as { message?: unknown; error?: unknown }
  if (typeof record.message === 'string' && record.message !== '') return record.message
  if (typeof record.error === 'string' && record.error !== '') return record.error
  return undefined
}

/**
 * 调用插件宿主半区的本地路由；失败抛 Error（消息可直接显示给用户）。
 * @param path - 插件路由路径。
 * @param body - JSON 请求体。
 * @param timeoutMs - 超时上限（宿主读大日志可能较慢，默认 20 秒）。
 */
async function hostPost<T>(path: string, body: unknown, timeoutMs = 20_000): Promise<T> {
  const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined
  let response: Response
  try {
    response = await fetch(urlOf(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (cause) {
    // AbortSignal.timeout 触发时抛 TimeoutError/DOMException：给出可读消息。
    if (signal?.aborted === true) throw new Error(`request timed out after ${String(timeoutMs)}ms`)
    throw cause
  }
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(messageOf(payload) ?? `HTTP ${response.status}`)
  }
  const record = payload as { ok?: unknown }
  if (record?.ok !== true) {
    throw new Error(messageOf(payload) ?? 'request failed')
  }
  return payload as T
}

/** 官方 unary RPC 的响应信封。 */
interface ServerEnvelope<T> {
  result?: RemoteResult<T>
}

const MISSING_ARG_PATTERN = /missing "([^"]+)"/

/**
 * 一次官方 unary RPC 调用（线协议回退路径）。
 * @param endpoint - `<namespace>/<method>`。
 * @param args - 命名参数对象（wire 名）。
 * @returns 官方 result 信封，不抛错。
 */
async function gatewayFetch<T>(endpoint: string, args: Record<string, unknown>): Promise<RemoteResult<T>> {
  const response = await fetch(urlOf(`${API_PATH}/${endpoint}`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: endpoint,
      payload: { args },
    }),
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 120)
    return { ok: false, error: { code: 'transport', message: `HTTP ${response.status}${detail === '' ? '' : ` ${detail}`}` } }
  }
  const envelope = (await readJson(response)) as ServerEnvelope<T> | undefined
  const result = envelope?.result
  if (result === undefined) return { ok: false, error: { code: 'transport', message: 'malformed response envelope' } }
  return result
}

/**
 * 官方 unary RPC（命名空间服务优先，线协议回退，参数改名自愈一次）。
 */
async function gatewayCall<T>(
  serviceName: string,
  method: string,
  args: Record<string, unknown>,
  get: (name: string) => unknown,
): Promise<RemoteResult<T>> {
  const service = get(serviceName) as Record<string, (...callArgs: unknown[]) => unknown> | undefined
  const callable = service?.[method]
  if (typeof callable === 'function') {
    try {
      return (await callable.call(service, ...Object.values(args))) as RemoteResult<T>
    } catch (cause) {
      // 命名空间服务自身抛错（未挂载/参数不匹配）→ 落到线协议再试一次。
      const fallback = await gatewayFetch<T>(method, args)
      if (fallback.ok || fallback.error?.code !== 'transport') return fallback
      return {
        ok: false,
        error: { code: 'client-api', message: cause instanceof Error ? cause.message : String(cause) },
      }
    }
  }
  const endpoint = `${serviceName.replace(/^remote\./, '')}/${method}`
  const first = await gatewayFetch<T>(endpoint, args)
  if (first.ok || first.error?.code !== 'gateway/arguments-invalid') return first
  const keys = Object.keys(args)
  const missing = MISSING_ARG_PATTERN.exec(first.error.message)?.[1]
  if (missing === undefined || keys.length !== 1 || missing === keys[0]) return first
  return gatewayFetch<T>(endpoint, { [missing]: args[keys[0] as string] })
}

function unwrap<T>(result: RemoteResult<T>, fallback: string): T {
  if (result.ok) return result.value
  throw new Error(result.error?.message !== undefined && result.error.message !== ''
    ? result.error.message
    : fallback)
}

/** 面板/AI 助手共用的后端门面。 */
export interface DshApi {
  /** 归档会话日志分页（尾部一页 / 向前翻页）。 */
  historyPage(input: { sessionId: SessionId; beforeSeq?: number; maxMessages: number }): Promise<ChatHistoryPage>
  /** 单会话对话内容检索：返回命中条数。 */
  contentMatches(input: { sessionId: SessionId; keyword: string; maxMessages: number }): Promise<number>
  /** 取消归档（恢复会话）。 */
  unarchive(sessionId: SessionId): Promise<void>
  /** 归档（隐藏 AI 助手会话）。 */
  archive(sessionId: SessionId): Promise<void>
  /** 新建会话，返回会话 id。 */
  createSession(input: { cwd?: string; agentPreset?: string; sessionId?: SessionId }): Promise<string>
  /** 向会话投递一轮 prompt。 */
  prompt(input: { sessionId: SessionId; text: string; mode?: 'queue' | 'steer' }): Promise<void>
  /** 选择会话使用的模型。 */
  selectModel(input: { sessionId: SessionId; provider: string; model: string; reasoningEffort?: string }): Promise<void>
  /** 宿主模型目录（provider 分组 + 默认真实路由）。 */
  modelCatalog(): Promise<ModelCatalog>
  /** agent preset 列表。 */
  agentPresets(): Promise<AgentPresetRow[]>
}

/**
 * 绑定到一个客户端 ctx 的 `get`（服务读取）构造后端门面。
 * @param get - `ctx.get`（缺失服务返回 undefined，不抛错）。
 * @returns 面板使用的后端门面。
 */
export function createDshApi(get: (name: string) => unknown): DshApi {
  return {
    async historyPage(input) {
      const payload = await hostPost<{ events: ChatMessageWire[]; hasMore: boolean; nextBeforeSeq?: number }>(
        '/api/archive-viewer/history',
        {
          sessionId: input.sessionId,
          ...(input.beforeSeq === undefined ? {} : { beforeSeq: input.beforeSeq }),
          maxMessages: input.maxMessages,
        },
      )
      return {
        events: (payload.events ?? []) as unknown as HistoryEntry[],
        hasMore: payload.hasMore === true,
        nextBeforeSeq: payload.nextBeforeSeq,
      }
    },

    async contentMatches(input) {
      const payload = await hostPost<{ matches: number }>('/api/archive-viewer/content-search', {
        sessionId: input.sessionId,
        keyword: input.keyword,
        maxMessages: input.maxMessages,
      })
      return typeof payload.matches === 'number' ? payload.matches : 0
    },

    async unarchive(sessionId) {
      await hostPost('/api/archive-viewer/unarchive', { sessionId })
    },

    async archive(sessionId) {
      await hostPost('/api/archive-viewer/archive', { sessionId })
    },

    async createSession(input) {
      const result = await gatewayCall<{ sessionId?: string }>('remote.session', 'create', {
        request: {
          ...(input.cwd === undefined || input.cwd === '' ? {} : { cwd: input.cwd }),
          ...(input.agentPreset === undefined || input.agentPreset === '' ? {} : { agentPreset: input.agentPreset }),
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        },
      }, get)
      const value = unwrap(result, 'session create failed')
      const sessionId = value?.sessionId
      if (typeof sessionId !== 'string' || sessionId === '') throw new Error('session create returned no id')
      return sessionId
    },

    async prompt(input) {
      const result = await gatewayCall<{ accepted?: true }>('remote.session', 'prompt', {
        request: {
          sessionId: input.sessionId,
          requestId: crypto.randomUUID(),
          mode: input.mode ?? 'queue',
          content: [{ type: 'text', text: input.text }],
        },
      }, get)
      unwrap(result, 'prompt failed')
    },

    async selectModel(input) {
      const result = await gatewayCall<{ selected?: unknown }>('remote.session', 'selectModel', {
        request: {
          sessionId: input.sessionId,
          provider: input.provider,
          model: input.model,
          ...(input.reasoningEffort === undefined || input.reasoningEffort === ''
            ? {}
            : { reasoningEffort: input.reasoningEffort }),
        },
      }, get)
      unwrap(result, 'model selection failed')
    },

    async modelCatalog() {
      const result = await gatewayCall<ModelCatalog>('remote.session', 'modelCatalog', {}, get)
      return unwrap(result, 'model catalog unavailable')
    },

    async agentPresets() {
      const result = await gatewayCall<{ presets?: AgentPresetRow[] }>('remote.agentPresets', 'list', {}, get)
      const value = unwrap(result, 'agent preset list unavailable')
      return Array.isArray(value?.presets) ? value.presets : []
    },
  }
}
