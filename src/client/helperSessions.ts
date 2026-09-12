/**
 * AI 助手会话管理：这些会话是插件内部使用的辅助会话，不应出现在侧边栏，
 * 也不应出现在归档面板里。模块同时负责：
 *  - 本地记录 helper session id（localStorage），用于归档面板过滤；
 *  - 调用 host 半区的 helper-sessions / session.delete API 注册与安全删除。
 */
import { useSyncExternalStore } from 'react'
import type { SessionId } from './types.ts'

const STORAGE_KEY = 'dsh-archive-viewer:helper-sessions:v1'
const CHANGE_EVENT = 'dsh-archive-viewer:helper-sessions-change'

let cached: ReadonlySet<SessionId> = load()

const listeners = new Set<() => void>()

function load(): ReadonlySet<SessionId> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw !== null && raw !== undefined) {
      const parsed = JSON.parse(raw) as { ids?: unknown }
      if (Array.isArray(parsed.ids)) {
        return new Set(parsed.ids.filter((id): id is string => typeof id === 'string' && id !== ''))
      }
    }
  } catch {
    // 忽略损坏数据
  }
  return new Set()
}

function persist(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ ids: [...cached] }))
  } catch {
    // 存储不可用时仅内存生效
  }
}

function emit(): void {
  for (const listener of [...listeners]) listener()
  try {
    globalThis.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    // 非浏览器环境
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// 跨标签页同步
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return
    cached = load()
    emit()
  })
}

export function getHelperSessionIds(): ReadonlySet<SessionId> {
  return cached
}

export function addHelperSession(id: SessionId): void {
  if (cached.has(id)) return
  cached = new Set(cached).add(id)
  persist()
  emit()
}

export function removeHelperSession(id: SessionId): void {
  if (!cached.has(id)) return
  const next = new Set(cached)
  next.delete(id)
  cached = next
  persist()
  emit()
}

export function useHelperSessionIds(): ReadonlySet<SessionId> {
  return useSyncExternalStore(subscribe, getHelperSessionIds)
}

function apiUrl(path: string): string {
  const origin = globalThis.location?.origin
  return new URL(
    path,
    origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal',
  ).toString()
}

interface HelperApiResponse {
  ok: boolean
  error?: string
}

async function postHelperApi(path: string, body: unknown): Promise<void> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  let payload: HelperApiResponse
  try {
    payload = (await response.json()) as HelperApiResponse
  } catch {
    throw new Error(`HTTP ${response.status}`)
  }
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error ?? `HTTP ${response.status}`)
  }
}

/** 在 host 侧登记一个 AI 助手会话（只有登记过的会话才允许被安全删除）。 */
export async function registerHelperSessionOnHost(id: SessionId): Promise<void> {
  await postHelperApi('/api/archive-viewer/helper-sessions', { sessionId: id, action: 'add' })
}

/** 在 host 侧注销一个 AI 助手会话（通常由删除接口自动完成，这里保留以备将来使用）。 */
export async function unregisterHelperSessionOnHost(id: SessionId): Promise<void> {
  await postHelperApi('/api/archive-viewer/helper-sessions', { sessionId: id, action: 'remove' })
}

/** 安全删除一个已登记的 AI 助手会话；非 helper 会话会被 host 拒绝。 */
export async function deleteHelperSessionOnHost(id: SessionId): Promise<void> {
  await postHelperApi('/api/archive-viewer/session/delete', { sessionId: id })
}

/** 把 AI 助手会话归档（从侧边栏分组中隐藏，但保留日志以便继续对话）。 */
export async function archiveHelperSession(id: SessionId): Promise<void> {
  await postHelperApi('/api/archive-viewer/archive', { sessionId: id })
}
