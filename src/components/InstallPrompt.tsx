import { useEffect, useState } from 'react'
import styles from './InstallPrompt.module.css'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'chat-demo-install-dismissed'

const isDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** 浏览器支持安装时在顶部显示一条「安装到桌面」提示；安卓打包版不会出现。 */
export const InstallPrompt = () => {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(isDismissed)

  useEffect(() => {
    const onBeforeInstall = (raw: Event) => {
      raw.preventDefault()
      setEvent(raw as InstallPromptEvent)
    }
    const onInstalled = () => {
      setEvent(null)
      setHidden(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!event || hidden) {
    return null
  }

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // 隐私模式写入失败时只隐藏本次提示
    }
  }

  return (
    <div className={styles.prompt} role="dialog" aria-label="安装到桌面">
      <span className={styles.text}>装到桌面，打开就是一个独立应用</span>
      <button
        type="button"
        className={styles.install}
        onClick={async () => {
          await event.prompt()
          const choice = await event.userChoice
          if (choice.outcome === 'accepted') {
            setEvent(null)
          }
        }}
      >
        安装
      </button>
      <button type="button" className={styles.close} aria-label="暂不安装" onClick={dismiss}>
        ×
      </button>
    </div>
  )
}
