import { loadEnvConfig } from '@next/env'
import { associationConfig, associationResponse } from '../lib/mobile/associations'
async function main() {
  loadEnvConfig(process.cwd())
  const config = associationConfig(process.env)
  if (!config) throw new Error('Configure verified mobile signing metadata before checking its public host.')
  for (const [platform, path] of [['ios', '/.well-known/apple-app-site-association'], ['android', '/.well-known/assetlinks.json']] as const) {
    if (!(platform === 'ios' ? config.ios : config.android)) continue
    const url = `https://${config.host}${path}`
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
    if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) throw new Error(`${platform}: public endpoint must return HTTP 200 application/json without a redirect.`)
    const actual = await response.json()
    const expected = await associationResponse(platform, new Request(url)).json()
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${platform}: published association differs from configured signing metadata.`)
    console.log(`${platform}: HTTPS association matches configured signing metadata (OS verification still required).`)
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Association check failed'); process.exitCode = 1 })
