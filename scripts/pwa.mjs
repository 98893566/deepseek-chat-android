import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
  )

const files = walk(dist)
  .map((file) => `/${path.relative(dist, file).split(path.sep).join('/')}`)
  .filter((file) => file !== '/sw.js')
  .sort()

const hash = createHash('sha1')
for (const file of files) {
  hash.update(file)
  hash.update(readFileSync(path.join(dist, file.slice(1))))
}
const version = hash.digest('hex').slice(0, 10)
const template = readFileSync(path.join(root, 'pwa/sw.js'), 'utf8')
writeFileSync(
  path.join(dist, 'sw.js'),
  template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(files))
)

console.log(`sw.js: ${files.length} files, version ${version}`)
