/**
 * SettingsPanel — 查看器设置弹层（面板头部齿轮按钮打开）。
 *
 * 覆盖新功能的全部可配置项：语言（跟随系统/中文/English）、排序方式与方向、
 * 排列方式（列表/网格）、内容搜索开关与扫描页数、介绍文本显隐、恢复默认。
 * 所有变更立即持久化（localStorage）并广播给面板与侧边栏入口。
 */
import { useEffect, useState } from 'react'
import type { TFunc } from './i18n.ts'
import type { ArchiveSettings, LayoutKind, SettingsUpdate, SortDir, SortKey } from './settings.ts'
import type { ConnectionHandle, ModelProviderGroup } from './types.ts'

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
  connection?: ConnectionHandle
  onClose(): void
}): JSX.Element {
  const { settings, update, reset, t, connection, onClose } = props

  const [presets, setPresets] = useState<{ id: string; name?: string }[]>([])
  const [presetsLoaded, setPresetsLoaded] = useState(false)
  const [modelGroups, setModelGroups] = useState<ModelProviderGroup[]>([])
  const [modelCatalogLoaded, setModelCatalogLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const api = connection?.api.agentPresets
    if (api === undefined) {
      setPresetsLoaded(true)
    } else {
      void api.list({}).then((response) => {
        if (cancelled) return
        if (response.result.ok) {
          setPresets(response.result.value?.presets.map(preset => ({ id: preset.id, name: preset.name })) ?? [])
        }
        setPresetsLoaded(true)
      }).catch(() => {
        if (!cancelled) setPresetsLoaded(true)
      })
    }
    const llm = connection?.api.llm
    if (llm === undefined) {
      setModelCatalogLoaded(true)
    } else {
      void llm.models({}).then((response) => {
        if (cancelled) return
        if (response.result.ok) {
          setModelGroups(response.result.value?.groups ?? [])
        }
        setModelCatalogLoaded(true)
      }).catch(() => {
        if (!cancelled) setModelCatalogLoaded(true)
      })
    }
    return () => { cancelled = true }
  }, [connection])

  const setSortKey = (value: SortKey): void => { update({ sortKey: value }) }
  const setSortDir = (value: SortDir): void => { update({ sortDir: value }) }
  const setLayout = (value: LayoutKind): void => { update({ layout: value }) }

  const currentModel = modelGroups
    .flatMap(group => group.models.map(model => ({ provider: group.id, model })))
    .find(entry => entry.provider === settings.aiProvider && entry.model.id === settings.aiModel)
  const reasoningEfforts = currentModel?.model.reasoning?.efforts ?? []

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

      {/* AI 助手 */}
      <div className="dsh-av-settings-section">
        <span className="dsh-av-settings-label">{t('aiMode')}</span>
        {presetsLoaded && presets.length > 0 ? (
          <div className="dsh-av-field-row">
            <select
              className="dsh-av-select"
              aria-label={t('aiMode')}
              value={settings.aiMode}
              onChange={(event) => { update({ aiMode: event.target.value }) }}
            >
              {!presets.some(preset => preset.id === settings.aiMode) && (
                <option value={settings.aiMode}>{settings.aiMode}</option>
              )}
              {presets.map(preset => (
                <option key={preset.id} value={preset.id}>{preset.name ?? preset.id}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="dsh-av-field-row">
            <input
              type="text"
              className="dsh-av-text-input"
              value={settings.aiMode}
              aria-label={t('aiMode')}
              onChange={(event) => { update({ aiMode: event.target.value }) }}
            />
          </div>
        )}
        <span className="dsh-av-settings-desc">{t('aiModeDesc')}</span>
      </div>

      {/* AI 模型与思考强度 */}
      <div className="dsh-av-settings-section">
        <span className="dsh-av-settings-label">{t('aiModel')}</span>
        {modelCatalogLoaded && modelGroups.length > 0 ? (
          <>
            <div className="dsh-av-field-row">
              <select
                className="dsh-av-select"
                aria-label={t('aiModel')}
                value={settings.aiModel === '' ? '' : `${settings.aiProvider}\u0000${settings.aiModel}`}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === '') {
                    update({ aiProvider: '', aiModel: '' })
                  } else {
                    const [provider, model] = value.split('\u0000')
                    update({ aiProvider: provider ?? '', aiModel: model ?? '' })
                  }
                }}
              >
                <option value="">{t('aiModelDefault')}</option>
                {!modelGroups.some(group => group.models.some(model => model.id === settings.aiModel && group.id === settings.aiProvider))
                  && settings.aiProvider !== '' && settings.aiModel !== '' && (
                  <option value={`${settings.aiProvider}\u0000${settings.aiModel}`}>
                    {settings.aiProvider} / {settings.aiModel}
                  </option>
                )}
                {modelGroups.map(group => group.models.map(model => (
                  <option key={`${group.id}\u0000${model.id}`} value={`${group.id}\u0000${model.id}`}>
                    {group.name} / {model.name ?? model.id}
                  </option>
                )))}
              </select>
            </div>
            <div className="dsh-av-field-row">
              <select
                className="dsh-av-select"
                aria-label={t('aiReasoningEffort')}
                value={settings.aiReasoningEffort}
                disabled={reasoningEfforts.length === 0}
                onChange={(event) => { update({ aiReasoningEffort: event.target.value }) }}
              >
                <option value="">{t('aiModelDefault')}</option>
                {reasoningEfforts.map(effort => (
                  <option key={effort.id} value={effort.id}>{effort.name}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div className="dsh-av-field-row">
              <input
                type="text"
                className="dsh-av-text-input"
                value={settings.aiProvider}
                placeholder={t('aiProvider')}
                aria-label={t('aiProvider')}
                onChange={(event) => { update({ aiProvider: event.target.value }) }}
              />
            </div>
            <div className="dsh-av-field-row">
              <input
                type="text"
                className="dsh-av-text-input"
                value={settings.aiModel}
                placeholder={t('aiModel')}
                aria-label={t('aiModel')}
                onChange={(event) => { update({ aiModel: event.target.value }) }}
              />
            </div>
            <div className="dsh-av-field-row">
              <input
                type="text"
                className="dsh-av-text-input"
                value={settings.aiReasoningEffort}
                placeholder={t('aiReasoningEffort')}
                aria-label={t('aiReasoningEffort')}
                onChange={(event) => { update({ aiReasoningEffort: event.target.value }) }}
              />
            </div>
          </>
        )}
        <span className="dsh-av-settings-desc">{t('aiModelDesc')}</span>
      </div>

      {/* AI 工作区 */}
      <div className="dsh-av-settings-section">
        <span className="dsh-av-settings-label">{t('aiWorkspace')}</span>
        <div className="dsh-av-field-row">
          <input
            type="text"
            className="dsh-av-text-input"
            value={settings.aiWorkspace}
            aria-label={t('aiWorkspace')}
            onChange={(event) => { update({ aiWorkspace: event.target.value }) }}
          />
        </div>
        <span className="dsh-av-settings-desc">{t('aiWorkspaceDesc')}</span>
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
