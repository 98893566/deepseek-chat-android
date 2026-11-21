import { useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { ApiError } from '../../services/api/client.js'
import { getVisibleMessages } from '../../services/chat/branches.js'
import { getContextRounds } from '../../services/chat/reply.js'
import { compressSession } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { showToast } from '../base/toastState.js'

/** 手动压缩上下文：总结较早的对话，保留最近一轮原文；生成中或轮次不足时不可用。 */
export const CompressAction = ({
  session,
  streaming,
}: {
  session: Session
  streaming: boolean
}) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const apiKey = useSettings((state) => state.apiKey)
  const [busy, setBusy] = useState(false)
  const available = !streaming && getContextRounds(getVisibleMessages(session)).length >= 2

  const run = async () => {
    if (!available || busy) {
      return
    }
    if (!apiKey) {
      showToast({ key: 'compactionMissingKey' })
      return
    }
    setBusy(true)
    try {
      const count = await compressSession(session.id)
      showToast({
        key: count > 0 ? 'compactionDone' : 'compactionEmpty',
        params: { count },
      })
    } catch (error) {
      const message =
        error instanceof ApiError && error.localMessage
          ? t(error.localMessage.key, error.localMessage.params)
          : error instanceof Error
            ? error.message
            : String(error)
      showToast({ key: 'compactionFailed', params: { message } })
    } finally {
      setBusy(false)
    }
  }

  const label = busy ? t('compacting') : t('compressContext')
  return isMobile ? (
    <Button
      variant="outlined"
      size="s"
      title={label}
      disabled={!available || busy}
      onClick={() => void run()}
    >
      {busy ? t('compacting') : t('compressShort')}
    </Button>
  ) : (
    <Button variant="outlined" size="s" disabled={!available || busy} onClick={() => void run()}>
      {label}
    </Button>
  )
}
