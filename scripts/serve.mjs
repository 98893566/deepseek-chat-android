import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 8099)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname.endsWith('/')) {
    pathname += 'index.html'
  }
  const file = path.join(root, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''))
  const target = existsSync(file) && statSync(file).isFile() ? file : path.join(root, 'index.html')
  const ext = path.extname(target).toLowerCase()
  const headers = {
    'Content-Type': types[ext] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Service-Worker-Allowed': '/',
  }
  if (['/sw.js', '/index.html', '/manifest.webmanifest'].includes(pathname) || ext === '.html') {
    headers['Cache-Control'] = 'no-cache'
  } else {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable'
  }
  res.writeHead(200, headers)
  createReadStream(target).pipe(res)
})

server.listen(port, host, () => {
  console.log(`chat-demo ready: http://${host}:${port}/`)
})
