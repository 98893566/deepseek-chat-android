import { createServer } from 'node:http'

/** 本地模拟中转站：CORS + /models + Anthropic 兼容的流式回复，仅用于联调。 */
const port = Number(process.env.PORT ?? 9100)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers':
    'content-type,authorization,x-api-key,anthropic-beta,accept,x-stainless-os,x-stainless-lang',
  'Access-Control-Expose-Headers': 'content-type',
}

const reply = '你好，我是测试中转站返回的回复。'

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }

  console.log('request', req.method, req.url, {
    key: req.headers['x-api-key'],
    authorization: req.headers.authorization,
  })

  if (req.method === 'GET' && req.url === '/models') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'deepseek-flash' }] }))
    return
  }

  if (
    req.method === 'POST' &&
    (req.url === '/anthropic/v1/messages' || req.url === '/v1/messages')
  ) {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.messages)) {
          console.log(
            'messages',
            parsed.messages
              .map((message) => {
                const text =
                  typeof message.content === 'string'
                    ? message.content.replace(/\s+/g, ' ').slice(0, 48)
                    : `[${message.content.map((block) => block.type).join(',')}]`
                return `${message.role}:${text}`
              })
              .join(' | ')
          )
        }
      } catch {
        // 非 JSON 请求忽略
      }
      res.writeHead(200, {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      send('message_start', {
        type: 'message_start',
        message: { id: 'mock-message', model: 'deepseek-flash' },
      })
      send('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '' },
      })
      for (const char of '我先观察一下四周的动静。') {
        send('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: char },
        })
      }
      send('content_block_stop', { type: 'content_block_stop', index: 0 })
      send('content_block_start', {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'text', text: '' },
      })
      for (const char of reply) {
        send('content_block_delta', {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text: char },
        })
      }
      send('content_block_stop', { type: 'content_block_stop', index: 1 })
      send('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 12 },
      })
      send('message_stop', { type: 'message_stop' })
      res.end()
    })
    return
  }

  res.writeHead(404, cors)
  res.end('not found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`mock relay: http://127.0.0.1:${port}`)
})
