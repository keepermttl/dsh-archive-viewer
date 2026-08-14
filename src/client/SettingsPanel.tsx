/**
 * SettingsPanel — 查看器设置弹层（面板头部齿轮按钮打开）。
 *
 * 覆盖新功能的全部可配置项：语言（跟随系统/中文/English）、排序方式与方向、
 * 排列方式（列表/网格）、内容搜索开关与扫描页数、介绍文本显隐、恢复默认。
 * 所有变更立即持久化（localStorage）并广播给面板与侧边栏入口。
 */
import type { TFunc } from './i18n.ts'
import type { ArchiveSettings, LayoutKind, SettingsUpdate, SortDir, SortKey } from './settings.ts'

/** 开关控件（data-active 高亮）。 */
function Toggle(props: {
  active: boolean
  label: string
  desc?: string
  onChange(active: boolean): void
}): JSX.Element {
  const { active, label, desc, onChange } = props
  return (
    <button
      type="button"
      className="dsh-av-toggle"
      data-active={active || undefined}
      aria-pressed={active}
      onClick={() => { onChange(!active) }}
    >
      <span className="dsh-av-toggle-label">{label}</span>
      <span className="dsh-av-toggle-switch" aria-hidden="true" />
      {desc !== undefined && <span className="dsh-av-toggle-desc">{desc}</span>}
    </button>
  )
}

/** 设置弹层。 */
export function SettingsPanel(props: {
  settings: ArchiveSettings
  update: SettingsUpdate
  reset(): void
  t: TFunc
  onClose(): void
}): JSX.Element {
  const { settings, update, reset, t, onClose } = props

  const setSortKey = (value: SortKey): void => { update({ sortKey: value }) }
  const setSortDir = (value: SortDir): void => { update({ sortDir: value }) }
  const setLayout = (value: LayoutKind): void => { update({ layout: value }) }

  return (
    <div className="dsh-av-settings" role="dialog" aria-label={t('settingsTitle')}>
      <div className="dsh-av-settings-head">
        <span className="dsh-av-settings-title">{t('settingsTitle')}</span>
        <button type="button" className="dsh-av-settings-close" aria-label={t('close')} onClick={onClose}>×</button>
      </div>

      {/* 语言 */}
      <div className="dsh-av-settings-section">
        <span className="dsh-av-settings-label">{t('lang')}</span>
        <div className="dsh-av-option-row">
          {(['auto', 'zh', 'en'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="dsh-av-option"
              data-active={settings.lang === value || undefined}
              aria-pressed={settings.lang === value}
              onClick={() => { update({ lang: value }) }}
            >
              {value === 'auto' ? t('langAuto') : value === 'zh' ? t('langZh') : t('langEn')}
            </button>
          ))}
        </div>
      </div>

      {/* 排序 */}
      <div className="dsh-av-settings-section">
        <span className="dsh-av-settings-label">{t('sectionSort')}</span>
        <div className="dsh-av-field-row">
          <select
            className="dsh-av-select"
            aria-label={t('sortBy')}
            value={settings.sortKey}
            onChange={(event) => { setSortKey(event.target.value as SortKey) }}
          >
            <option value="updatedAt">{t('sortUpdatedAt')}</option>
            <option value="title">{t('sortTitle')}</option>
            <option value="sessionId">{t('sortSessionId')}</option>
          </select>
          <select
            className="dsh-av-select"
            aria-label={t('direction')}
            value={settings.sortDir}
            onChange={(event) => { setSortDir(event.target.value as SortDir) }}
          >
            <option value="desc">{t('desc')}</option>
            <option value="asc">{t('asc')}</option>
          </select>
        </div>
      </div>

      {/* 排列方式 */}
      <div className="dsh-av-settings-section">
        <span className="dsh-av-settings-label">{t('layout')}</span>
        <div className="dsh-av-option-row">
          {(['list', 'grid'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="dsh-av-option"
              data-active={settings.layout === value || undefined}
              aria-pressed={settings.layout === value}
              onClick={() => { setLayout(value) }}
            >
              {value === 'list' ? t('layoutList') : t('layoutGrid')}
            </button>
          ))}
        </div>
      </div>

      {/* 搜索 */}
      <div className="dsh-av-settings-section">
        <span className="dsh-av-settings-label">{t('sectionSearch')}</span>
        <Toggle
          active={settings.deepSearch}
          label={t('deepSearch')}
          desc={t('deepSearchDesc')}
          onChange={(active) => { update({ deepSearch: active }) }}
        />
        <div className="dsh-av-field-row">
          <select
            className="dsh-av-select"
            aria-label={t('scanPages')}
            value={settings.deepSearchPages}
            disabled={!settings.deepSearch}
            onChange={(event) => { update({ deepSearchPages: Number(event.target.value) }) }}
          >
            {[1, 2, 3, 5, 10].map((pages) => (
              <option key={pages} value={pages}>{pages}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 界面 */}
      <div className="dsh-av-settings-section">
        <span className="dsh-av-settings-label">{t('sectionUi')}</span>
        <Toggle
          active={settings.showNote}
          label={t('showNote')}
          onChange={(active) => { update({ showNote: active }) }}
        />
      </div>

      <div className="dsh-av-settings-foot">
        <button type="button" className="dsh-av-btn" onClick={reset}>{t('reset')}</button>
      </div>
    </div>
  )
}
