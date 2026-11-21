/** 构建时注入的默认 API 地址，见 rspack.config.ts */
export const DEFAULT_API_BASE_URL = __API_ORIGIN__

/**
 * 规范化用户填写的接口地址：允许省略协议、粘贴带 /v1 或 /messages 的完整地址，
 * 去掉末尾斜杠和查询串；不是合法 http(s) 地址时返回空字符串。
 */
export const normalizeApiBase = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
      return ''
    }
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

export type ApiEndpoints = {
  /** Anthropic 兼容接口前缀，messages / files 直接拼接在其后 */
  anthropic: string
  /** 校验 API Key 用，按顺序尝试 */
  models: string[]
  /** ASR / TTS 接口前缀 */
  tools: string
}

/**
 * 兼容几种常见的填写方式：
 * - https://api.deepseek.com              → /anthropic/v1 前缀
 * - https://relay.example.com/anthropic   → /anthropic/v1 前缀
 * - https://relay.example.com/anthropic/v1
 * - https://relay.example.com/v1          → 直接作为 Anthropic 版本前缀
 * - https://relay.example.com/v1/messages
 */
export const resolveApiEndpoints = (value: string): ApiEndpoints => {
  const base = normalizeApiBase(value) || DEFAULT_API_BASE_URL
  const url = new URL(base)
  const origin = url.origin
  let path = url.pathname.replace(/\/+$/, '')

  if (path.endsWith('/v1/messages')) {
    path = path.slice(0, -'/messages'.length)
  }

  if (path.endsWith('/anthropic/v1')) {
    const root = path.slice(0, -'/anthropic/v1'.length)
    return {
      anthropic: `${origin}${path}`,
      models: unique([`${origin}${root}/models`, `${origin}/models`, `${origin}${path}/models`]),
      tools: `${origin}${root}/v1/tools`,
    }
  }
  if (path.endsWith('/anthropic')) {
    const root = path.slice(0, -'/anthropic'.length)
    return {
      anthropic: `${origin}${path}/v1`,
      models: unique([`${origin}${root}/models`, `${origin}${root}/v1/models`]),
      tools: `${origin}${root}/v1/tools`,
    }
  }
  if (path.endsWith('/v1')) {
    return {
      anthropic: `${origin}${path}`,
      models: unique([`${origin}${path}/models`, `${origin}/models`]),
      tools: `${origin}${path}/tools`,
    }
  }
  return {
    anthropic: `${origin}${path}/anthropic/v1`,
    models: unique([`${origin}${path}/models`, `${origin}${path}/v1/models`]),
    tools: `${origin}${path}/v1/tools`,
  }
}

const unique = (values: string[]): string[] => [...new Set(values)]
