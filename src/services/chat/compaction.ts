import type { ChatModel } from '../api/types.js'
import { streamMessage } from '../api/client.js'
import type { AssistantMessage, TextPart, UserMessage } from './types.js'

/** 单条消息放进总结请求时的最大字符数，避免总结请求本身超长 */
const MAX_MESSAGE_CHARS = 3000
/** 单次总结请求的对话字符上限；超过时按轮次分段总结 */
const MAX_CHUNK_CHARS = 24000

const SUMMARY_SYSTEM_PROMPT = `你是对话整理助手。请把用户与助手的对话压缩成一份供后续对话使用的背景摘要。
要求：
- 保留用户的目标、偏好、约束、关键事实、已经确认的结论、数字、名称、链接和代码标识。
- 记录尚未完成或还需要确认的事项。
- 不编造、不评价、不添加原文没有的信息。
- 用简洁的中文要点，控制在 500 字以内。
只输出摘要正文，不要加标题或解释。`

const truncate = (text: string, max = MAX_MESSAGE_CHARS) =>
  text.length > max ? `${text.slice(0, max)}…` : text

const isTextPart = (block: AssistantMessage['blocks'][number]): block is TextPart =>
  block.type === 'text' && !block.isTemplate

/** 回答里参与总结的正文，忽略服务端提示、思考与工具块 */
const answerText = (reply: AssistantMessage): string =>
  reply.blocks
    .filter(isTextPart)
    .map((block) => block.text)
    .join('\n')
    .trim()

/** 把若干轮对话拼成纯文本 */
export const formatTranscript = (rounds: [UserMessage, AssistantMessage][]): string =>
  rounds
    .map(([user, reply]) => {
      const question = user.content.trim() || '（用户只发送了附件）'
      const answer = answerText(reply) || '（该轮没有文字回答）'
      return `用户：${truncate(question)}\n助手：${truncate(answer)}`
    })
    .join('\n\n')

/** 按轮次切块，单块不会明显超过上限 */
export const chunkRounds = (
  rounds: [UserMessage, AssistantMessage][],
  max = MAX_CHUNK_CHARS
): [UserMessage, AssistantMessage][][] => {
  const chunks: [UserMessage, AssistantMessage][][] = []
  let current: [UserMessage, AssistantMessage][] = []
  let length = 0
  for (const round of rounds) {
    const size = round[0].content.length + answerText(round[1]).length + 16
    if (current.length > 0 && length + size > max) {
      chunks.push(current)
      current = []
      length = 0
    }
    current.push(round)
    length += size
  }
  if (current.length > 0) {
    chunks.push(current)
  }
  return chunks
}

const requestSummary = async (
  apiKey: string,
  previousSummary: string,
  transcript: string,
  signal: AbortSignal
): Promise<string> => {
  const content = [
    previousSummary ? `已有摘要：\n${previousSummary}` : '还没有摘要。',
    `新增对话：\n${transcript}`,
    '请输出合并后的完整摘要。',
  ].join('\n\n')

  let text = ''
  for await (const event of streamMessage(
    apiKey,
    {
      model: 'deepseek-flash' as ChatModel,
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      thinking: { type: 'disabled' },
      tools: [],
      safety_check: { level: 'high' },
    },
    signal
  )) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text
    }
  }

  const summary = text.trim()
  if (!summary) {
    throw new Error('总结结果为空')
  }
  return summary
}

/**
 * 逐段总结：已有摘要 + 新对话 → 新摘要。
 * 对话较长时分成多段依次合并，避免单次请求超长。
 */
export const summarizeRounds = async ({
  apiKey,
  rounds,
  previousSummary,
  signal,
}: {
  apiKey: string
  rounds: [UserMessage, AssistantMessage][]
  previousSummary?: string
  signal: AbortSignal
}): Promise<string> => {
  let summary = previousSummary?.trim() ?? ''
  for (const chunk of chunkRounds(rounds)) {
    summary = await requestSummary(apiKey, summary, formatTranscript(chunk), signal)
  }
  return summary
}
