/** 发布更新检查所用的 GitHub 仓库；改仓库/用户名时同步这里 */
export const UPDATE_REPO = '98893566/deepseek-chat-android'

const RELEASE_API = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`

export type UpdateResult = {
  /** 当前安装的版本 */
  current: string
  /** Release 的 tag，例如 v1.8.0 */
  tag: string
  notes: string
  apkUrl: string
  pageUrl: string
  newer: boolean
}

export class UpdateError extends Error {
  constructor(
    readonly kind: 'network' | 'http' | 'no-apk' | 'protocol',
    message: string
  ) {
    super(message)
    this.name = 'UpdateError'
  }
}

/** 构建时注入的页面版本（meta application-version） */
export const currentVersion = (): string => {
  const content = document
    .querySelector('meta[name="application-version"]')
    ?.getAttribute('content')
  return content?.trim() || '0.0.0'
}

const numericParts = (version: string): number[] =>
  version
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => Number.isFinite(value))

/** 比较语义化版本；返回 >0 表示 a 比 b 新 */
export const compareVersions = (a: string, b: string): number => {
  const left = numericParts(a)
  const right = numericParts(b)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

type GitHubRelease = {
  tag_name?: unknown
  body?: unknown
  html_url?: unknown
  assets?: unknown
}

type GitHubAsset = {
  name?: unknown
  browser_download_url?: unknown
}

/** 读取仓库最新 Release，找出 APK 资源并和当前版本比较 */
export const checkForUpdate = async (signal?: AbortSignal): Promise<UpdateResult> => {
  let response: Response
  try {
    response = await fetch(RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal,
    })
  } catch (error) {
    if (signal?.aborted) {
      throw error
    }
    throw new UpdateError('network', error instanceof Error ? error.message : String(error))
  }

  if (!response.ok) {
    throw new UpdateError('http', `HTTP ${response.status}`)
  }

  const data = (await response.json().catch(() => null)) as GitHubRelease | null
  if (!data || typeof data.tag_name !== 'string') {
    throw new UpdateError('protocol', 'invalid release payload')
  }

  const assets = Array.isArray(data.assets) ? (data.assets as GitHubAsset[]) : []
  const apk = assets.find(
    (asset) =>
      typeof asset.name === 'string' &&
      asset.name.toLowerCase().endsWith('.apk') &&
      typeof asset.browser_download_url === 'string'
  )
  if (!apk || typeof apk.browser_download_url !== 'string') {
    throw new UpdateError('no-apk', 'no apk asset')
  }

  let apkUrl: URL
  try {
    apkUrl = new URL(apk.browser_download_url)
  } catch {
    throw new UpdateError('protocol', 'invalid asset url')
  }
  // 只接受 GitHub 的 https 下载地址，避免 Release 被塞入其他链接
  if (apkUrl.protocol !== 'https:' || apkUrl.hostname !== 'github.com') {
    throw new UpdateError('protocol', 'unexpected asset host')
  }

  const current = currentVersion()
  return {
    current,
    tag: data.tag_name,
    notes: typeof data.body === 'string' ? data.body.trim() : '',
    apkUrl: apkUrl.toString(),
    pageUrl:
      typeof data.html_url === 'string'
        ? data.html_url
        : `https://github.com/${UPDATE_REPO}/releases`,
    newer: compareVersions(data.tag_name, current) > 0,
  }
}
