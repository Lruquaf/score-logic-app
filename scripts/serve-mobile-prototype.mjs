import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const port = Number(process.env.MOBILE_PREVIEW_PORT ?? 4173)
const assets = new Map([
  ['/', ['prototypes/mobile/index.html', 'text/html']],
  ['/index.html', ['prototypes/mobile/index.html', 'text/html']],
  ['/app.mjs', ['prototypes/mobile/app.mjs', 'text/javascript']],
  ['/model.mjs', ['prototypes/mobile/model.mjs', 'text/javascript']],
  ['/prototype.css', ['prototypes/mobile/prototype.css', 'text/css']],
  ['/packages/design-tokens/index.mjs', ['packages/design-tokens/index.mjs', 'text/javascript']]
])
const server = http.createServer(async (request, response) => {
  const asset = assets.get(new URL(request.url ?? '/', 'http://localhost').pathname)
  if (!asset || !['GET', 'HEAD'].includes(request.method ?? '')) {
    response.writeHead(404).end('Not found')
    return
  }
  try {
    const contents = await readFile(fileURLToPath(new URL(asset[0], root)))
    response.writeHead(200, {
      'Content-Type': `${asset[1]}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'"
    }).end(request.method === 'HEAD' ? undefined : contents)
  } catch {
    response.writeHead(500).end('Preview asset unavailable')
  }
})
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`ScoreLogic mobile UX preview: http://127.0.0.1:${port}\n`)
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close())
