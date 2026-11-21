import { useEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { DEFAULT_API_BASE_URL, normalizeApiBase } from '../../services/api/baseUrl.js'
import { setApiBaseUrl, useSettings } from '../../services/settings.js'
import styles from './Settings.module.css'

/** 接口地址：默认官方地址，可填写中转站；失焦或回车即保存。 */
export const ApiBaseUrlField = () => {
  const t = useTranslate()
  const saved = useSettings((state) => state.apiBaseUrl)
  const [value, setValue] = useState(saved)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(saved)
    setError(null)
  }, [saved])

  const commit = () => {
    const next = normalizeApiBase(value)
    if (!next) {
      setError(t('apiBaseUrlInvalid'))
      return
    }
    setError(null)
    setValue(next)
    setApiBaseUrl(next)
  }

  return (
    <div className={styles.cell}>
      <div className={styles.apiKey}>
        <div className={styles.label}>{t('apiBaseUrlLabel')}</div>
        <div className={styles.description}>{t('apiBaseUrlDescription')}</div>
        <div className={styles.apiKeyInput}>
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={DEFAULT_API_BASE_URL}
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setError(null)
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.currentTarget.blur()
              }
            }}
          />
          <button
            type="button"
            className={styles.confirm}
            // 保持输入框焦点，避免先触发失焦保存
            onMouseDown={(event) => event.preventDefault()}
            onClick={commit}
          >
            {t('confirm')}
          </button>
        </div>
        {error ? <div className={styles.error}>{error}</div> : null}
        {saved !== DEFAULT_API_BASE_URL ? (
          <button
            type="button"
            className={styles.reset}
            onClick={() => {
              setValue(DEFAULT_API_BASE_URL)
              setError(null)
              setApiBaseUrl(DEFAULT_API_BASE_URL)
            }}
          >
            {t('apiBaseUrlReset')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
