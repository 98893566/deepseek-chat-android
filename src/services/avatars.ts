/** 头像缩略图边长；存成 data URL 放进 localStorage，避免额外占 IndexedDB */
const AVATAR_SIZE = 160
/** 原图上限，避免手机相册里的超大图把内存打满 */
const MAX_FILE_SIZE = 12 * 1024 * 1024

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image load failed'))
    }
    image.src = url
  })

/** 把用户选的图片裁成正方形缩略图，输出 data URL */
export const toAvatarDataUrl = async (file: File): Promise<string> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('unsupported image')
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('image too large')
  }

  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('canvas unavailable')
  }

  const scale = Math.max(AVATAR_SIZE / image.width, AVATAR_SIZE / image.height)
  const width = image.width * scale
  const height = image.height * scale
  context.drawImage(image, (AVATAR_SIZE - width) / 2, (AVATAR_SIZE - height) / 2, width, height)

  const dataUrl = canvas.toDataURL('image/webp', 0.85)
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('encode failed')
  }
  return dataUrl
}
