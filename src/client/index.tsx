/**
 * dsh-archive-viewer 的 browser 半区入口。
 *
 * 挂载方式（v2）：不再做 DOM 注入——入口注册进 shell 的「插件栏」
 * （sidebar.footer.action 列表槽位，位于侧边栏底部设置上方），与官方
 * ui-cordis 面板同一位置同一机制；面板渲染在该注册项的 fixed 层叠内。
 * 全部样式走 --dsw-alias-* 设计令牌，自动跟随当前皮肤。
 *
 * 失败策略：注册逻辑不抛错；即使槽位不可用也只影响本插件，不拖垮 GUI。
 */
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArchivePanelView } from './ArchivePanel.tsx'
import { ShutdownButton } from './ShutdownButton.tsx'
import { CSS_TEXT } from './style.ts'
import { createDshApi } from './dshApi.ts'
import { makeT, resolveLang } from './i18n.ts'
import { loadSettings, useSettings } from './settings.ts'
import type { ArchiveStores, ViewerContext } from './types.ts'

/**
 * 需要等待注入的服务。
 *
 * slots/sessions/workspaces 是当前 DSH 客户端里稳定的服务键（ui-slots、
 * api-session-controller、api-workspace-controller 提供）。其余后端能力一律
 * 走 dshApi.ts：插件自己的宿主路由 + 官方 unary RPC（命名空间服务优先，
 * 缺失时线协议回退），因此不需要把 `remote.*` 命名空间写进 inject —— 少一个
 * 服务键就少一处会让插件 fiber 停摆的版本耦合点。
 */
export const inject = ['slots', 'sessions', 'workspaces']

/** 与 shell 16px 导航图标观感一致的归档图标。 */
const ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11M3.5 4.5v8a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-8M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5"/><path d="M6.5 8h3"/></svg>`

/** 注入面板样式（幂等；loader 卸载时会按 data-plugin 清理）。 */
function injectCss(): void {
  if (document.querySelector('style[data-dsh-archive-viewer-css]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.dshArchiveViewerCss = ''
  tag.dataset.plugin = 'archive-viewer'
  tag.textContent = CSS_TEXT
  document.head.appendChild(tag)
}

/**
 * 插件栏入口 + 面板（sidebar.footer.action 列表项）。
 *
 * 面板必须 Portal 到 document.body：它虽是侧边栏槽位的子组件，但视觉上是浮动在
 * 对话区上方的 fixed 层。皮肤（如 maid-atelier）会在「侧边栏作用域」内把
 * --dsw-alias-label-* 重定义为浅色文字（浅色模式下侧边栏是深色底），若面板留在
 * 侧边栏 DOM 内，就会继承浅色文字令牌却配 body 作用域的浅色底色——浅字白底不可读。
 * Portal 后令牌继承跟随 body 作用域，浅色/深色皮肤下文字与底色都正确。
 * @param props - 槽位 owner 注入的 wide（折叠态）与 inject face 携带的数据源。
 */
export function ArchiveTrigger(props: { wide: boolean } & { stores: ArchiveStores }): JSX.Element {
  const { wide, stores } = props
  const [open, setOpen] = useState(false)
  const [settings] = useSettings()
  // 入口标签跟随设置里的语言偏好（与面板同步）。
  const t = useMemo(() => makeT(resolveLang(settings.lang)), [settings.lang])
  const label = t('panelTitle')

  return (
    <div data-dsh-archive-viewer-layer data-rail={!wide || undefined}>
      {open && createPortal(
        <ArchivePanelView stores={stores} onClose={() => setOpen(false)} />,
        document.body,
      )}
      <div data-dsh-archive-viewer-footer>
        <button
          type="button"
          data-dsh-archive-viewer-badge
          data-active={open || undefined}
          aria-label={label}
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
        >
          <span dangerouslySetInnerHTML={{ __html: ICON }} />
          {wide && <span data-dsh-archive-viewer-badge-label>{label}</span>}
        </button>
      </div>
    </div>
  )
}

/**
 * 插件 apply：注入样式并注册两处入口——侧边栏插件栏的归档面板入口，
 * 以及会话头部右上角的「关闭 dsh」按钮。
 * @param ctx - client 根上下文（slots/sessions/workspaces/connection 已注入）。
 */
export function apply(ctx: ViewerContext): void {
  injectCss()
  const stores: ArchiveStores = {
    sessions: ctx.sessions.list,
    workspaces: ctx.workspaces.list,
    dsh: createDshApi(name => ctx.get(name)),
  }
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'archive-viewer',
    order: 10,
    // 每次调用都读最新设置，跟随手动语言偏好。
    label: () => makeT(resolveLang(loadSettings().lang))('panelTitle'),
    inject: () => ({ stores }),
  }, ArchiveTrigger))

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'archive-viewer-shutdown',
    order: 100,
    label: () => makeT(resolveLang(loadSettings().lang))('shutdownTitle'),
  }, ShutdownButton))
}
