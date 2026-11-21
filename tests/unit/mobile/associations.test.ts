import { describe, expect, it } from 'vitest'
import { associationConfig, associationResponse } from '@/lib/mobile/associations'
const env = { MOBILE_LINK_HOST: 'links.example.com', MOBILE_IOS_APP_ID: 'ABCDE12345.com.example.scorelogic', MOBILE_ANDROID_PACKAGE: 'com.example.scorelogic', MOBILE_ANDROID_SHA256_FINGERPRINTS: Array(32).fill('AB').join(':') }
describe('mobile domain associations', () => {
  it('serves platform-specific JSON without redirects, limited Apple paths and the actual signing fingerprint', async () => {
    const ios = associationResponse('ios', new Request('https://links.example.com/.well-known/apple-app-site-association'), env)
    expect(ios.status).toBe(200); expect(ios.headers.get('content-type')).toContain('application/json')
    expect(await ios.json()).toEqual({ applinks: { apps: [], details: [{ appIDs: [env.MOBILE_IOS_APP_ID], components: [{ '/': '/puzzles/*' }] }] } })
    const android = associationResponse('android', new Request('https://links.example.com/.well-known/assetlinks.json'), env)
    expect((await android.json())[0].target).toEqual({ namespace: 'android_app', package_name: env.MOBILE_ANDROID_PACKAGE, sha256_cert_fingerprints: [env.MOBILE_ANDROID_SHA256_FINGERPRINTS] })
    expect(android.headers.get('location')).toBeNull()
  })
  it('does not advertise placeholders on an unconfigured or different host', () => {
    expect(associationConfig({})).toBeNull()
    expect(associationResponse('ios', new Request('https://links.example.com'), {}).status).toBe(404)
    expect(associationResponse('ios', new Request('https://other.example.com'), env).status).toBe(404)
  })
  it('uses the explicit allowed Host behind a standalone bind URL and rejects spoofed alternate hosts', () => {
    expect(associationResponse('ios', new Request('http://0.0.0.0:8080/.well-known/apple-app-site-association', { headers: { host: env.MOBILE_LINK_HOST } }), env).status).toBe(200)
    expect(associationResponse('ios', new Request('https://links.example.com', { headers: { host: 'other.example.com' } }), env).status).toBe(404)
    expect(associationResponse('ios', new Request('https://links.example.com', { headers: { host: 'links.example.com@evil.example' } }), env).status).toBe(404)
  })
  it('rejects partial/malformed metadata and serves no accidental cacheable success', () => {
    for (const bad of [{ ...env, MOBILE_LINK_HOST: 'https://links.example.com' }, { ...env, MOBILE_ANDROID_SHA256_FINGERPRINTS: '' }, { ...env, MOBILE_IOS_APP_ID: 'wrong.com.example' }, { MOBILE_LINK_HOST: env.MOBILE_LINK_HOST }]) {
      expect(() => associationConfig(bad)).toThrow()
      const response = associationResponse('ios', new Request('https://links.example.com'), bad)
      expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })
  it('supports separate platform rollout and signing-key rotation without duplicate fingerprints', () => {
    expect(associationConfig({ MOBILE_LINK_HOST: env.MOBILE_LINK_HOST, MOBILE_IOS_APP_ID: env.MOBILE_IOS_APP_ID })!.android).toBeUndefined()
    const config = associationConfig({ ...env, MOBILE_ANDROID_SHA256_FINGERPRINTS: `${env.MOBILE_ANDROID_SHA256_FINGERPRINTS},${env.MOBILE_ANDROID_SHA256_FINGERPRINTS},${Array(32).fill('CD').join(':')}` })!
    expect(config.fingerprints).toHaveLength(2)
  })
})
