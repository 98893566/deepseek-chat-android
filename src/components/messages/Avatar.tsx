import clsx from 'clsx'
import { useSettings } from '../../services/settings.js'
import styles from './Avatar.module.css'

/** 对话头像：有自定义图片时显示图片，否则显示「我」/「AI」占位。 */
export const Avatar = ({ kind }: { kind: 'user' | 'ai' }) => {
  const src = useSettings((state) => (kind === 'user' ? state.userAvatar : state.aiAvatar))
  return (
    <div
      className={clsx(styles.avatar, kind === 'user' ? styles.user : styles.ai)}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" /> : <span>{kind === 'user' ? '我' : 'AI'}</span>}
    </div>
  )
}
