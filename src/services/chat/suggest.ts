import type { ChatModel } from '../api/types.js'
import { streamMessage } from '../api/client.js'
import { getContextRounds } from './reply.js'
import type { AssistantMessage, Message, TextPart } from './types.js'

/** 参与建议的最近轮数 */
const MAX_ROUNDS = 10
/** 单条消息最多带入的字数 */
const MAX_MESSAGE_CHARS = 1200

const SYSTEM_PROMPT = `你是一个角色扮演对话助手。根据给出的对话记录，替用户（「我」）写一条接下来发送的回复，用来推动剧情。
要求：
- 以「我」的第一人称，承接对方最后一句话；
- 可以包含 1-2 句台词，以及简短的动作、神态或心理描写；
- 不要替对方说话，不要预判对方的反应，不要写旁白总结；
- 不要解释，不要列选项，不要加「我：」前缀；
- 控制在 60-150 字，只输出回复正文。`

const isTextPart = (block: AssistantMessage['blocks'][number]): block is TextPart =>
  block.type === 'text' && !block.isTemplate

const replyText = (reply: AssistantMessage): string =>
  reply.blocks
    .filter(isTextPart)
    .map((block) => block.text)
    .join('\n')
    .trim()

const truncate = (text: string, max = MAX_MESSAGE_CHARS) =>
  text.length > max ? `${text.slice(0, max)}…` : text

/** 把最近的对话拼成「我 / 对方」的文本，供建议请求使用 */
export const buildSuggestionTranscript = (messages: Message[]): string =>
  getContextRounds(messages)
    .slice(-MAX_ROUNDS)
    .map(([user, reply]) => {
      const question = truncate(user.content.trim() || '（发送了图片或文件）')
      const answer = truncate(replyText(reply) || '（没有文字内容）')
      return `我：${question}\n对方：${answer}`
    })
    .join('\n\n')

/** 生成一条「我」接下来可以发送的回复；variant 用来换一个方向 */
export const suggestUserReply = async ({
  apiKey,
  messages,
  variant = 0,
  signal,
}: {
  apiKey: string
  messages: Message[]
  variant?: number
  signal: AbortSignal
}): Promise<string> => {
  const transcript = buildSuggestionTranscript(messages)
  const content = [
    `对话记录：\n${transcript}`,
    '请写出「我」接下来的一条回复。',
    variant > 0 ? '换一个不同的剧情走向，不要重复上一次的思路。' : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  let text = ''
  for await (const event of streamMessage(
    apiKey,
    {
      model: 'deepseek-flash' as ChatModel,
      system: SYSTEM_PROMPT,
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

  const suggestion = text.trim()
  if (!suggestion) {
    throw new Error('生成结果为空')
  }
  return suggestion
}
