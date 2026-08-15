/**
 * 归档会话标签客户端。
 *
 * 标签由 host 半区持久化在 DSH profile 目录的 JSON 文件中，并通过
 * /api/archive-viewer/tags 提供读写。浏览器 UI 与标准 DSH agent 都通过这组
 * 接口操作标签；隐藏的临时检索标签（HIDDEN_TAG）由同一存储承载，UI 层特殊处理。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionId, TagMap } from './types.ts'

/** 隐藏临时检索标签（与 host 半区保持一致）。 */
export const HIDDEN_TAG = 'agent检索'

interface TagsApiResponse {
  ok: boolean
  tags: Record<string, string[]>
  hiddenTag?: string
  error?: string
}

function tagsUrl(): string {
  const origin = globalThis.location?.origin
  return new URL(
    '/api/archive-viewer/tags',
    origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal',
  ).toString()
}

async function parseTagsResponse(response: Response): Promise<TagsApiResponse> {
  let body: TagsApiResponse
  try {
    body = (await response.json()) as TagsApiResponse
  } catch {
    throw new Error(`HTTP ${response.status}`)
  }
  if (!response.ok || body.ok !== true) {
    throw new Error(body.error ?? `HTTP ${response.status}`)
  }
  return body
}

/** 拉取全量标签映射。 */
export async function fetchTags(): Promise<TagMap> {
  const response = await fetch(tagsUrl())
  const body = await parseTagsResponse(response)
  return body.tags
}

/** 给某个会话增加/移除标签；返回该会话最新的标签列表。 */
export async function updateTags(
  sessionId: SessionId,
  add: readonly string[] = [],
  remove: readonly string[] = [],
): Promise<string[]> {
  const response = await fetch(tagsUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      ...(add.length > 0 ? { add } : {}),
      ...(remove.length > 0 ? { remove } : {}),
    }),
  })
  const body = await parseTagsResponse(response)
  return body.tags[sessionId] ?? []
}

/** 清除所有会话上的隐藏临时检索标签（用户取消勾选/agent 清理时调用）。 */
export async function clearHiddenTag(): Promise<void> {
  const response = await fetch(tagsUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clearHidden: true }),
  })
  await parseTagsResponse(response)
}

/**
 * 订阅标签映射。active=false 时不启动轮询，但手动 refresh 仍可用。
 * @param active - 是否启用周期刷新（AI 助手展开/正在工作时建议开启）。
 * @param refreshMs - 轮询间隔。
 */
export function useTags(active = true, refreshMs = 5000): {
  tags: TagMap
  loading: boolean
  error: string | null
  refresh(): Promise<void>
  addTags(sessionId: SessionId, tags: readonly string[]): Promise<void>
  removeTags(sessionId: SessionId, tags: readonly string[]): Promise<void>
  clearHidden(): Promise<void>
} {
  const [tags, setTags] = useState<TagMap>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const suppressRefreshRef = useRef(false)

  const refresh = useCallback(async (force = false) => {
    if (!force && suppressRefreshRef.current) return
    setLoading(true)
    try {
      const next = await fetchTags()
      setTags(next)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!active) return
    timerRef.current = window.setInterval(() => { void refresh() }, refreshMs)
    return () => {
      window.clearInterval(timerRef.current)
      timerRef.current = undefined
    }
  }, [active, refreshMs, refresh])

  const addTags = useCallback(async (sessionId: SessionId, list: readonly string[]) => {
    const next = await updateTags(sessionId, list)
    setTags(prev => ({ ...prev, [sessionId]: next }))
  }, [])

  const removeTags = useCallback(async (sessionId: SessionId, list: readonly string[]) => {
    const next = await updateTags(sessionId, [], list)
    setTags(prev => {
      const copy = { ...prev }
      if (next.length === 0) delete copy[sessionId]
      else copy[sessionId] = next
      return copy
    })
  }, [])

  const clearHidden = useCallback(async () => {
    // 先乐观清除本地隐藏标签，界面立即响应；期间暂停周期刷新避免旧数据回灌。
    suppressRefreshRef.current = true
    setTags(prev => {
      const copy: Record<string, string[]> = {}
      for (const [id, list] of Object.entries(prev)) {
        const filtered = list.filter(tag => tag !== HIDDEN_TAG)
        if (filtered.length > 0) copy[id] = filtered
      }
      return copy
    })
    try {
      await clearHiddenTag()
      await refresh(true)
    } finally {
      suppressRefreshRef.current = false
    }
  }, [refresh])

  return { tags, loading, error, refresh, addTags, removeTags, clearHidden }
}
