import { useEffect, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { ApiError } from '../../services/api/client.js'
import { getVisibleMessages } from '../../services/chat/branches.js'
import { getDraft, setDraftText } from '../../services/chat/drafts.js'
import { suggestUserReply } from '../../services/chat/suggest.js'
import { useChatStore } from '../../services/chat/store.js'
import { useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { IconSparkleOutline16 } from '../base/icons.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './SuggestReply.module.css'

/** 帮我回一句：根据当前对话生成一条「我」的回复，填入输入框后可以修改再发送。 */
export const SuggestReply = ({
  sessionId,
  disabled,
  variant = 'icon',
}: {
  sessionId: string
  disabled: boolean
  /** chip 用在输入框上方，icon 用在消息操作栏 */
  variant?: 'icon' | 'chip'
}) => {
  const t = useTranslate()
  const apiKey = useSettings((state) => state.apiKey)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hasDraft, setHasDraft] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const variantRef = useRef(0)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const generate = async () => {
    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller
    setLoading(true)
    setError(null)
    setText('')
    try {
      const session = useChatStore.getState().sessionCache[sessionId]
      if (!session) {
        return
      }
      const suggestion = await suggestUserReply({
        apiKey: apiKey ?? '',
        messages: getVisibleMessages(session),
        variant: variantRef.current,
        signal: controller.signal,
      })
      if (controller.signal.aborted) {
        return
      }
      variantRef.current += 1
      setText(suggestion)
    } catch (cause) {
      if (controller.signal.aborted) {
        return
      }
      setError(
        cause instanceof ApiError && cause.localMessage
          ? t(cause.localMessage.key, cause.localMessage.params)
          : cause instanceof Error
            ? cause.message
            : String(cause)
      )
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }

  const close = () => {
    controllerRef.current?.abort()
    setOpen(false)
  }

  const start = () => {
    if (!apiKey) {
      showToast({ key: 'apiKeyMissing' })
      return
    }
    setHasDraft(Boolean(getDraft(sessionId).text.trim()))
    setOpen(true)
    void generate()
  }

  const fill = () => {
    const value = text.trim()
    if (!value) {
      return
    }
    setDraftText(sessionId, value)
    close()
  }

  return (
    <>
      {variant === 'chip' ? (
        <button type="button" className={styles.chip} disabled={disabled} onClick={start}>
          <IconSparkleOutline16 />
          <span>{t('suggestReply')}</span>
        </button>
      ) : (
        <IconButton
          icon={<IconSparkleOutline16 />}
          tooltip={t('suggestReply')}
          tooltipPlacement="bottom"
          disabled={disabled}
          onClick={start}
        />
      )}
      {open ? (
        <Modal
          title={t('suggestReplyTitle')}
          closable
          onClose={close}
          footer={
            <>
              <Button variant="outlined" disabled={loading} onClick={() => void generate()}>
                {t('suggestReplyRetry')}
              </Button>
              <Button disabled={loading || !text.trim()} onClick={fill}>
                {t('suggestReplyFill')}
              </Button>
            </>
          }
        >
          <div className={styles.body}>
            <div className={styles.hint}>{t('suggestReplyHint')}</div>
            {loading && !text ? (
              <div className={styles.loading}>{t('suggestReplyLoading')}</div>
            ) : (
              <textarea
                className={styles.textarea}
                rows={6}
                value={text}
                disabled={loading}
                onChange={(event) => setText(event.target.value)}
              />
            )}
            {error ? <div className={styles.error}>{t('suggestReplyFailed', { message: error })}</div> : null}
            {hasDraft ? <div className={styles.note}>{t('suggestReplyReplaceNote')}</div> : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
