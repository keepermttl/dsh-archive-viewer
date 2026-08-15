/**
 * 查看器设置：类型、localStorage 持久化、跨组件共享的 useSettings hook。
 *
 * 存储键带版本后缀；读取时与默认值合并并对枚举/数值做校验，避免脏数据。
 * 变更通过模块级事件广播（saveSettings → emit），任何 useSettings 消费方
 * （面板、设置弹层、侧边栏入口）都会同步刷新。
 */
import { useSyncExternalStore } from 'react'
import type { LangPref } from './i18n.ts'

/** 排序键。 */
export type SortKey = 'updatedAt' | 'title' | 'sessionId'

/** 排序方向。 */
export type SortDir = 'asc' | 'desc'

/** 排列方式：竖列（列表）/ 横排（网格）。 */
export type LayoutKind = 'list' | 'grid'

/** 标签筛选模式：AND（满足全部选中标签）/ OR（满足任一选中标签）。 */
export type TagFilterMode = 'and' | 'or'

/** 全部可持久化设置项。 */
export interface ArchiveSettings {
  /** 语言偏好（auto = 跟随浏览器）。 */
  lang: LangPref
  /** 排序键。 */
  sortKey: SortKey
  /** 排序方向。 */
  sortDir: SortDir
  /** 排列方式。 */
  layout: LayoutKind
  /** 是否显示面板顶部介绍文本（可关闭）。 */
  showNote: boolean
  /** 关键词是否同时搜索对话内容。 */
  deepSearch: boolean
  /** 内容搜索时每会话从尾部最多扫描的页数（每页 PAGE_SIZE 条消息）。 */
  deepSearchPages: number
  /** AI 助手使用的 agent preset id（默认 standard 标准模式）。 */
  aiMode: string
  /** AI 助手使用的模型 provider（空 = 使用会话默认）。 */
  aiProvider: string
  /** AI 助手使用的模型 id（空 = 使用会话默认）。 */
  aiModel: string
  /** AI 助手使用的思考强度 / reasoning effort（空 = 使用模型默认）。 */
  aiReasoningEffort: string
  /** AI 助手会话的工作目录（cwd）。 */
  aiWorkspace: string
  /** 标签筛选模式：and = 同时满足，or = 满足任一。 */
  tagFilterMode: TagFilterMode
}

export const DEFAULT_SETTINGS: ArchiveSettings = {
  lang: 'auto',
  sortKey: 'updatedAt',
  sortDir: 'desc',
  layout: 'list',
  showNote: true,
  deepSearch: false,
  deepSearchPages: 5,
  aiMode: 'standard',
  aiProvider: '',
  aiModel: '',
  aiReasoningEffort: '',
  aiWorkspace: 'E:\\dsh-ai-workspace',
  tagFilterMode: 'or',
}

const STORAGE_KEY = 'dsh-archive-viewer:settings:v1'
const CHANGE_EVENT = 'dsh-archive-viewer:settings-change'
const LANG_PREFS: readonly LangPref[] = ['auto', 'zh', 'en']
const SORT_KEYS: readonly SortKey[] = ['updatedAt', 'title', 'sessionId']
const SORT_DIRS: readonly SortDir[] = ['asc', 'desc']
const LAYOUTS: readonly LayoutKind[] = ['list', 'grid']
const TAG_FILTER_MODES: readonly TagFilterMode[] = ['and', 'or']

let cached: ArchiveSettings | null = null

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) listener()
}

/** 读取设置（带内存缓存 + 合并默认值 + 字段校验）。 */
export function loadSettings(): ArchiveSettings {
  if (cached !== null) return cached
  const merged: ArchiveSettings = { ...DEFAULT_SETTINGS }
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw !== null && raw !== undefined) {
      const parsed = JSON.parse(raw) as Partial<ArchiveSettings>
      if (LANG_PREFS.includes(parsed.lang ?? 'auto')) merged.lang = parsed.lang!
      if (SORT_KEYS.includes(parsed.sortKey ?? 'updatedAt')) merged.sortKey = parsed.sortKey!
      if (SORT_DIRS.includes(parsed.sortDir ?? 'desc')) merged.sortDir = parsed.sortDir!
      if (LAYOUTS.includes(parsed.layout ?? 'list')) merged.layout = parsed.layout!
      if (typeof parsed.showNote === 'boolean') merged.showNote = parsed.showNote
      if (typeof parsed.deepSearch === 'boolean') merged.deepSearch = parsed.deepSearch
      if (typeof parsed.deepSearchPages === 'number' && Number.isFinite(parsed.deepSearchPages)) {
        merged.deepSearchPages = Math.min(20, Math.max(1, Math.round(parsed.deepSearchPages)))
      }
      if (typeof parsed.aiMode === 'string' && parsed.aiMode.trim() !== '') {
        merged.aiMode = parsed.aiMode.trim()
      }
      if (typeof parsed.aiProvider === 'string') merged.aiProvider = parsed.aiProvider.trim()
      if (typeof parsed.aiModel === 'string') merged.aiModel = parsed.aiModel.trim()
      if (typeof parsed.aiReasoningEffort === 'string') merged.aiReasoningEffort = parsed.aiReasoningEffort.trim()
      if (typeof parsed.aiWorkspace === 'string' && parsed.aiWorkspace.trim() !== '') {
        merged.aiWorkspace = parsed.aiWorkspace.trim()
      }
      if (TAG_FILTER_MODES.includes(parsed.tagFilterMode ?? 'or')) {
        merged.tagFilterMode = parsed.tagFilterMode!
      }
    }
  } catch {
    // 解析失败/非安全上下文：保持默认值
  }
  cached = merged
  return merged
}

/** 保存设置并广播变更。 */
export function saveSettings(next: ArchiveSettings): void {
  cached = next
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 存储不可用时仅内存生效
  }
  try {
    globalThis.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    // 非浏览器环境（理论不会发生）
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// 跨标签页同步（同一浏览器多开 GUI 时）。
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return
    cached = null
    emit()
  })
}

export type SettingsUpdate = (patch: Partial<ArchiveSettings>) => void

/**
 * 订阅设置：返回 [settings, update, reset]。
 * update 合并局部变更；reset 恢复默认。
 */
export function useSettings(): [ArchiveSettings, SettingsUpdate, () => void] {
  const settings = useSyncExternalStore(subscribe, loadSettings)
  const update: SettingsUpdate = (patch) => {
    saveSettings({ ...loadSettings(), ...patch })
  }
  const reset = (): void => {
    saveSettings({ ...DEFAULT_SETTINGS })
  }
  return [settings, update, reset]
}
