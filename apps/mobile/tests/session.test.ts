import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { nativeSessionDataSchema } from '@scorelogic/contracts'
import { SessionClient } from '../src/core/session.ts'
import { assertApiOrigin } from '../src/core/http.ts'
import type { Transport } from '../src/core/http.ts'
import { envelope, identity, json, origin, random, vault } from './helpers.ts'

test('guest creation survives a lost reply and restart with the same complete request', async () => {
  const saved = vault(), bodies: unknown[] = []
  const transport: Transport = async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); if (bodies.length === 1) throw new Error('reply lost'); return json(envelope(identity())) }
  await assert.rejects(new SessionClient(origin, saved, random(), nativeSessionDataSchema, transport).ensureSession())
  assert.equal(saved.values.has('session'), false)
  const restored = await new SessionClient(origin, saved, random(), nativeSessionDataSchema, transport).ensureSession()
  assert.equal(restored.user.id, 'guest-one')
  assert.deepEqual(bodies[1], bodies[0])
  assert.match((bodies[0] as { installationSecret: string }).installationSecret, /^[A-Za-z0-9_-]{43}$/)
})

test('refresh retries the original token and command after lost reply and restart', async () => {
  const saved = vault(), requests: unknown[] = [], existing = identity()
  existing.session.accessTokenExpiresAt = new Date(Date.now() - 1000).toISOString()
  await saved.set('session', existing)
  const next = identity(); next.session.accessToken = 'new-access'.repeat(6); next.session.refreshToken = 'new-refresh'.repeat(5)
  const transport: Transport = async (url, init) => {
    if (url.endsWith('/auth/refresh')) { requests.push(JSON.parse(String(init?.body))); if (requests.length === 1) throw new Error('committed, lost reply'); return json(envelope(next)) }
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${next.session.accessToken}`)
    return json(envelope({ ok: true }))
  }
  await assert.rejects(new SessionClient(origin, saved, random(), nativeSessionDataSchema, transport).call('/health'))
  const response = await new SessionClient(origin, saved, random(), nativeSessionDataSchema, transport).call<{ ok: boolean }>('/health')
  assert.equal(response.data.ok, true)
  assert.deepEqual(requests[1], requests[0])
  assert.equal(await saved.get('refresh-pending'), null)
  assert.equal((await saved.get<typeof next>('session'))?.session.refreshToken, next.session.refreshToken)
})

test('simultaneous expired-token requests share one refresh', async () => {
  const saved = vault(), existing = identity()
  existing.session.accessTokenExpiresAt = new Date(Date.now() - 1000).toISOString()
  await saved.set('session', existing)
  let refreshes = 0
  const client = new SessionClient(origin, saved, random(), nativeSessionDataSchema, async url => {
    if (url.endsWith('/auth/refresh')) { refreshes++; await new Promise(resolve => setTimeout(resolve, 10)); return json(envelope(identity())) }
    return json(envelope({ ok: true }))
  })
  await Promise.all([client.call('/one'), client.call('/two'), client.call('/three')])
  assert.equal(refreshes, 1)
})

test('unknown login result is kept in the secure vault and settled once after restart', async () => {
  const saved = vault(), requests: unknown[] = []
  await saved.set('session', identity())
  const account = identity('account-one'); account.user.isAnonymous = false; account.user.email = 'demo@example.invalid'
  const transport: Transport = async (_url, init) => { requests.push(JSON.parse(String(init?.body))); if (requests.length === 1) throw new Error('reply lost'); return json(envelope(account)) }
  const client = new SessionClient(origin, saved, random(), nativeSessionDataSchema, transport)
  await assert.rejects(client.authenticate('login', 'demo@example.invalid', 'invented-password', { commandsSettled: true, draftsSynced: true }))
  assert.equal(saved.values.has('auth-pending'), true)
  const restored = await new SessionClient(origin, saved, random(), nativeSessionDataSchema, transport).ensureSession()
  assert.equal(restored.user.id, 'account-one')
  assert.deepEqual(requests[1], requests[0])
  assert.equal(saved.values.has('auth-pending'), false)
  assert.equal(JSON.stringify([...saved.values.values()]).includes('invented-password'), false)
})

test('API configuration permits HTTPS and explicit development localhost only', () => {
  assert.equal(assertApiOrigin('https://api.example/'), 'https://api.example')
  assert.equal(assertApiOrigin('http://10.0.2.2:3109', true), 'http://10.0.2.2:3109')
  for (const url of ['http://api.example', 'http://127.0.0.1:3109', 'https://user:secret@api.example', 'https://api.example/?token=secret', 'https://api.example/api']) assert.throws(() => assertApiOrigin(url))
})

test('a 401 racing an owner change never retries the previous command as the new owner', async () => {
  const saved = vault(); await saved.set('session', identity())
  let calls = 0
  const client = new SessionClient(origin, saved, random(), nativeSessionDataSchema, async () => {
    calls++
    const other = identity('different-owner'); other.session.accessToken = 'different-token'.repeat(4)
    await saved.set('session', other)
    return json({ error: { code: 'UNAUTHORIZED', message: 'expired' } }, 401)
  })
  await assert.rejects(client.call('/puzzles/example/commands', { method: 'POST', body: '{}' }), /original player/)
  assert.equal(calls, 1)
})

test('a late refresh waiter reuses the token already rotated by an earlier request', async () => {
  const saved = vault(), original = identity(), next = identity()
  next.session.accessToken = 'rotated-access'.repeat(5)
  await saved.set('session', next)
  let calls = 0
  const client = new SessionClient(origin, saved, random(), nativeSessionDataSchema, async () => { calls++; return json(envelope(next)) })
  assert.equal((await client.refresh(original.session.accessToken)).session.accessToken, next.session.accessToken)
  assert.equal(calls, 0)
})

test('logout with an expired access token retries the same refresh proof after a lost reply', async () => {
  const saved = vault(), original = identity(), bodies: unknown[] = []
  original.session.accessTokenExpiresAt = new Date(0).toISOString()
  await saved.set('session', original)
  const client = new SessionClient(origin, saved, random(), nativeSessionDataSchema, async (url, options) => {
    assert.ok(url.endsWith('/auth/logout'))
    bodies.push(JSON.parse(String(options?.body)))
    if (bodies.length === 1) throw new Error('reply lost')
    return json(envelope({ revoked: true }))
  })
  await assert.rejects(client.logout())
  assert.ok(await saved.get('session'))
  await client.logout()
  assert.deepEqual(bodies[0], bodies[1])
  assert.deepEqual(bodies[0], { refreshToken: original.session.refreshToken })
  assert.equal(await saved.get('session'), null)
})

test('corrupt pending authentication and refresh records stay local and are never silently deleted or sent', async () => {
  for (const key of ['auth-pending', 'refresh-pending']) {
    const saved = vault(); await saved.set('session', identity())
    const invalid = key === 'auth-pending' ? { kind: 'login', body: { commandId: 'broken' } } : { refreshToken: 'broken', commandId: 'broken' }
    await saved.set(key, invalid)
    let calls = 0
    const client = new SessionClient(origin, saved, random(), nativeSessionDataSchema, async () => { calls++; throw new Error('must not send') })
    await assert.rejects(client.call('/health'), /recovery data could not be read/)
    assert.equal(calls, 0)
    assert.deepEqual(await saved.get(key), invalid)
    assert.ok(await saved.get('session'))
  }
})
