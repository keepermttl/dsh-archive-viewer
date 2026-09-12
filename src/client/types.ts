/**
 * Local structural types for the surfaces this plugin consumes.
 *
 * 刻意不 import 任何 @deepseek-ai/* 类型：本插件面向运行中的 DSH host
 * （0.1.2-rc.x checkout），npm SDK 版本落后且缺少 archivedSessionIds 等
 * 新字段；结构类型与 wire 形状逐字一致，构建时零框架依赖。
 * 形状来源：packages/api/session-controller/src/{types.ts,client/sessions/service.ts}、
 * packages/api/workspace-controller/src/client/model.ts、
 * packages/client/ui-slots（槽位注册选项）。
 */

/** Opaque session id（wire 上是 branded string，这里按字符串使用）。 */
export type SessionId = string

/** 会话列表行（client runtime SessionSummary 的结构子集）。 */
export interface SessionSummary {
  id: SessionId
  title?: string
  displayTitle: string
  cwd?: string
  agentPreset?: string
  running: boolean
  blank: boolean
  updatedAt: number
  /** Host 侧投影值（含 title 投影键）。 */
  projectionValues?: Readonly<Partial<Record<string, unknown>>> & { title?: string | null }
}

/** sessions.list store 快照（SessionListState 结构子集）。 */
export interface SessionListState {
  ids: readonly SessionId[]
  byId: Readonly<Record<SessionId, SessionSummary>>
  current: SessionId | undefined
  phase: string
}

/** 工作区行（WorkspaceView 结构子集）。 */
export interface WorkspaceView {
  workspaceId: string
  path: string
  title: string
  sessionIds: readonly SessionId[]
}

/** workspaces.list store 快照（WorkspaceListState 结构子集）。 */
export interface WorkspaceListState {
  items: readonly WorkspaceView[]
  archivedSessionIds: readonly SessionId[]
  state: 'idle' | 'loading' | 'error'
  phase: string
  baselinesReady: boolean
}

/** 快照 store（SnapshotStore 结构子集，useSyncExternalStore 直接消费）。 */
export interface SnapshotStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** slots 服务的注册选项（ui-slots 的 register options 结构子集）。 */
export interface SlotRegistrationOptions {
  name: string
  id: string
  order?: number
  label?: string | (() => string)
  inject?: () => unknown
}

/** slots 服务（ui-slots 的 SlotRegistry 结构子集）。 */
export interface SlotsService {
  inject(name: string, factory: () => unknown): void
  register(options: SlotRegistrationOptions, component: unknown): () => void
}

/** client runtime 服务（ClientContext 结构子集，当前 DSH 版本）。 */
export interface ViewerContext {
  slots: SlotsService
  sessions: { list: SnapshotStore<SessionListState> }
  workspaces: { list: SnapshotStore<WorkspaceListState> }
  get(name: string): unknown
  logger: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
  }
  effect(callback: () => (() => void) | void, label?: string): void
}

/** 面板需要的数据源（经 slot inject face 传入组件）。 */
export interface ArchiveStores {
  sessions: SnapshotStore<SessionListState>
  workspaces: SnapshotStore<WorkspaceListState>
  /** 后端门面（插件宿主路由 + 官方 unary RPC），见 dshApi.ts。 */
  dsh: import('./dshApi.ts').DshApi
}

/** 文本内容块（ContentBlock 结构子集）。 */
export interface TextBlock {
  type: 'text'
  text: string
}

/**
 * 会话事件（面板消费的归一化形状）。
 *
 * 宿主半区把日志事件折叠后只回传 text：新版 user/message 的事件数据是
 * UserMessage 本体（data.content[]），assistant/message 是
 * { turn, step, message }（data.message.content[]），旧版还有扁平的
 * data.text —— 归一化只在这一处做，UI 不必跟着事件形状改。
 */
export interface SessionEvent {
  seq: number
  time: number
  type: string
  data: {
    text?: string
    content?: readonly TextBlock[]
  }
}

/** history 分页的一行（与旧 session.history 的 HistoryEntry 同形）。 */
export interface HistoryEntry {
  event: SessionEvent
}

/** 插件宿主路由 /api/archive-viewer/history 的响应。 */
export interface ChatHistoryPage {
  events: HistoryEntry[]
  hasMore: boolean
  nextBeforeSeq?: number
}

/** 官方 Remote 结果信封（ok/value 或 ok/error）。 */
export type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error?: { code: string; message: string } }

/** 模型 id 与推理强度（ModelSelection 结构子集）。 */
export interface ModelSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** agent preset 一行（AgentPresetRow 结构子集）。 */
export interface AgentPresetRow {
  id: string
  name?: string
  description?: string
  isDefault?: boolean
  trust?: string
  broken?: string
}

/** 归档会话标签映射（sessionId → 标签列表）。 */
export type TagMap = Readonly<Record<SessionId, readonly string[]>>

/** 模型推理强度（reasoning effort）结构子集。 */
export interface ModelReasoningEffort {
  id: string
  name: string
  description?: string
}

/** 目录中的单个模型（ModelCatalogModel 结构子集）。 */
export interface ModelCatalogModel {
  id: string
  name: string
  description?: string
  reasoning?: {
    efforts: ModelReasoningEffort[]
    defaultEffort?: string
  }
}

/** 一个 provider 及其模型列表（ModelProviderGroup 结构子集）。 */
export interface ModelProviderGroup {
  id: string
  name: string
  models: ModelCatalogModel[]
}

/** session/modelCatalog 的返回值（ModelCatalog 结构子集）。 */
export interface ModelCatalog {
  default?: ModelSelection
  routableProviders?: readonly string[]
  groups: readonly ModelProviderGroup[]
  failures?: readonly { id: string; name: string; message: string }[]
}

