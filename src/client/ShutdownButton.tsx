/**
 * ShutdownButton — 右上角「关闭 dsh」按钮。
 *
 * 注册在 conversation.session.header.utilities（会话头部右侧工具区）。
 * 点击后经确认框调用宿主 host.shutdown RPC（等价于在启动终端按 Ctrl+C）：
 * 宿主以标准 5 秒宽限优雅收尾后退出；会话日志均已持久化，重启后原样恢复。
 */
import { useMemo, useState } from 'react'
import { makeT, resolveLang } from './i18n.ts'
import { useSettings } from './settings.ts'

/** 电源图标（与 shell 16px 导航图标观感一致）。 */
const POWER_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.5v6"/><path d="M4.9 3.3a5.5 5.5 0 1 0 6.2 0"/></svg>`

/**
 * 触发宿主优雅关机（host.shutdown RPC，RPC 信封与官方客户端一致）。
 * 响应是尽力而为的——进程可能先于响应刷新而退出。
 */
async function shutdownRpc(): Promise<void> {
  const origin = globalThis.location?.origin
  const response = await fetch(
    new URL('/api/host.shutdown', origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: crypto.randomUUID(),
        method: 'host.shutdown',
        payload: {},
      }),
    },
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const envelope = (await response.json()) as {
    result?: { ok?: boolean; error?: { message?: string } }
  }
  if (envelope.result?.ok !== true) {
    throw new Error(envelope.result?.error?.message ?? '未知错误')
  }
}

/** 右上角关闭按钮（无 owner 注入，自给自足）。 */
export function ShutdownButton(): JSX.Element {
  const [shuttingDown, setShuttingDown] = useState(false)
  const [settings] = useSettings()
  // 文案跟随设置里的语言偏好（与面板同步）。
  const t = useMemo(() => makeT(resolveLang(settings.lang)), [settings.lang])
  const title = t('shutdownTitle')

  const onShutdown = async (): Promise<void> => {
    if (shuttingDown) return
    if (!window.confirm(t('shutdownConfirm'))) return
    setShuttingDown(true)
    try {
      await shutdownRpc()
      // 成功后进程即将退出；按钮保持「关闭中」状态直到页面断开。
    } catch (cause) {
      window.alert(t('shutdownFailed', { msg: cause instanceof Error ? cause.message : String(cause) }))
      setShuttingDown(false)
    }
  }

  return (
    <button
      type="button"
      className="dsh-av-shutdown"
      aria-label={title}
      title={title}
      disabled={shuttingDown}
      onClick={() => { void onShutdown() }}
    >
      {shuttingDown
        ? <span aria-hidden>…</span>
        : <span dangerouslySetInnerHTML={{ __html: POWER_ICON }} />}
    </button>
  )
}
