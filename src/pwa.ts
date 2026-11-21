/**
 * 注册离线缓存：安装到桌面后即使本机服务没启动也能打开界面。
 * 安卓打包版（WebView）和 file:// 打开时不注册，资源本身就在本地。
 */
export const setupOfflineCache = () => {
  if (!('serviceWorker' in navigator)) {
    return
  }
  if (!/^https?:$/.test(location.protocol) || 'DSHAndroid' in window) {
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // 不支持或注册失败时直接使用网络，不影响应用本身
    })
  })

  let hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true
      return
    }
    if (reloading) {
      return
    }
    reloading = true
    location.reload()
  })
}
