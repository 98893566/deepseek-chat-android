import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { getVisibleMessages } from '../../services/chat/branches.js'
import { clearCompaction } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import styles from './CompactionBanner.module.css'

/** 会话顶部的压缩状态：可展开摘要，也可恢复完整上下文。 */
export const CompactionBanner = ({ session }: { session: Session }) => {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  const compaction = session.compaction
  if (!compaction) {
    return null
  }
  const applies = getVisibleMessages(session).some(
    (message) => message.id === compaction.upToMessageId
  )
  if (!applies) {
    return null
  }

  return (
    <div className={styles.banner}>
      <div className={styles.text}>{t('compactionActive', { count: compaction.rounds })}</div>
      <div className={styles.actions}>
        <button type="button" onClick={() => setOpen((value) => !value)}>
          {open ? t('compactionHide') : t('compactionView')}
        </button>
        <button type="button" onClick={() => clearCompaction(session.id)}>
          {t('compactionRestore')}
        </button>
      </div>
      {open ? <div className={styles.summary}>{compaction.summary}</div> : null}
    </div>
  )
}
