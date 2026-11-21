import React from 'react'
import * as Linking from 'expo-linking'
import { act, render, screen, userEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { nativeSessionDataSchema } from '@scorelogic/contracts'
import { AppShell } from '../../src/ui/AppShell'
import { StatusView } from '../../src/ui/StatusView'
import { ApiError } from '../../src/core/http'
import { SessionClient } from '../../src/core/session'
import { PuzzleController } from '../../src/core/controller'
import { LifecycleCoordinator, MobileRuntime } from '../../src/core/runtime'
import { envelope, identity, json, origin, random, store, vault, puzzle, progress } from '../helpers'
import type { Services } from '../../src/ui/services'

async function services(): Promise<Services> {
  const saved = vault(), database = store(), rng = random()
  await saved.set('session', identity())
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async url => {
    if (url.endsWith('/puzzles/campaign')) return json(envelope({ puzzles: [], progress: [] }))
    return json(envelope({ user: { userId: 'guest-one', isAnonymous: true }, stats: null }))
  })
  const controller = new PuzzleController(client, database, rng)
  const runtime = new MobileRuntime(client, database, controller)
  return { controller, client, runtime, lifecycle: new LifecycleCoordinator(controller), config: { apiOrigin: origin, webOrigin: origin, scheme: 'scorelogic-dev' } }
}
test('hydration gate hides navigation until identity and owner storage are ready', async () => {
  const app = await services()
  const view = await render(<SafeAreaProvider><AppShell services={app} /></SafeAreaProvider>)
  expect(screen.getByLabelText('Restoring your session and saved data')).toBeVisible()
  expect(screen.queryByText('Campaign')).toBeNull()
  await view.unmount()
  app.controller.dispose()
})
test('real four-tab navigator opens Campaign and Help and returns through the stack', async () => {
  const app = await services()
  await app.runtime.start()
  const view = await render(<SafeAreaProvider><AppShell services={app} /></SafeAreaProvider>)
  const user = userEvent.setup()
  expect(screen.getByText('Your next clever move.')).toBeVisible()
  expect(screen.getAllByLabelText(/tab, \d of 4/)).toHaveLength(4)
  await user.press(screen.getByLabelText('Campaign, tab, 3 of 4'))
  expect(await screen.findByText('Every pack starts at level 1. Solve levels in order within a pack.')).toBeVisible()
  await user.press(screen.getByRole('button', { name: 'Open help' }))
  expect(await screen.findByText('Read the table. Reconstruct the scores.')).toBeVisible()
  await user.press(screen.getByRole('button', { name: /back/i }))
  expect(await screen.findByText('Every pack starts at level 1. Solve levels in order within a pack.')).toBeVisible()
  await view.unmount()
  app.controller.dispose()
})
test('offline, maintenance and storage failures show a visible recovery action', async () => {
  const retry = jest.fn()
  const view = await render(<StatusView issue="maintenance" message="Draft preserved" retry={retry} />)
  expect(screen.getByText('The service is temporarily unavailable')).toBeVisible()
  await userEvent.press(screen.getByRole('button', { name: 'Try again' }))
  expect(retry).toHaveBeenCalledTimes(1)
  await view.rerender(<StatusView issue="storage" retry={retry} />)
  expect(screen.getByText('Your saved data needs attention')).toBeVisible()
  await view.rerender(<StatusView issue="offline" retry={retry} />)
  expect(screen.getByText('You are offline')).toBeVisible()
})

test('hint sheet has an explicit action and a lost reply retries one receipt then closes', async () => {
  const app = await services(), current = puzzle(), canonical = progress(current)
  let commands = 0, commandId = ''
  app.client.transport = async (url, options) => {
    if (url.includes('/commands/')) return json(envelope({ commandId, revision: 2, result: { progress: canonical, hint: { type: 'reveal', message: 'One score revealed.' } } }))
    if (url.endsWith('/commands')) {
      commands++
      commandId = JSON.parse(String(options?.body)).commandId
      canonical.revision = 2
      canonical.hintsUsed = canonical.currentState!.hintsUsed = canonical.currentAttempt!.hintsUsed = 1
      canonical.currentState!.revealedCells = [{ matchId: 'm1', side: 'home' }]
      canonical.currentState!.inputs.m1.home = 2
      throw new Error('committed reply lost')
    }
    return json(envelope({ puzzle: current, progress: canonical }))
  }
  await app.runtime.start()
  const view = await render(<SafeAreaProvider><AppShell services={app} /></SafeAreaProvider>)
  const user = userEvent.setup()
  await user.press(screen.getByLabelText('Daily, tab, 2 of 4'))
  await user.press(await screen.findByRole('button', { name: 'Hint' }))
  expect(screen.getByText('Get one hint')).toBeVisible()
  expect(commands).toBe(0)
  await user.press(screen.getByRole('button', { name: 'Use 1 hint' }))
  await user.press(await screen.findByRole('button', { name: 'Retry the same hint' }))
  expect(await screen.findByText('One score revealed.')).toBeVisible()
  expect(screen.queryByText('Get one hint')).toBeNull()
  expect(screen.getByText('1 hints used')).toBeVisible()
  expect(commands).toBe(1)
  await view.unmount(); app.controller.dispose()
})

test('session recovery hides all prior-owner gameplay and exposes explicit recovery choices', async () => {
  const app = await services()
  await app.runtime.start()
  app.runtime.report(new ApiError(401, 'UNAUTHORIZED', 'Expired'))
  const view = await render(<SafeAreaProvider><AppShell services={app} /></SafeAreaProvider>)
  expect(screen.getByText('Restore your session')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry session recovery' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Start a new guest' })).toBeVisible()
  expect(screen.queryByText('Your next clever move.')).toBeNull()
  await view.unmount(); app.controller.dispose()
})

test('foreground reconciliation closes the pending hint sheet without an extra tap or purchase', async () => {
  const app = await services(), current = puzzle(), canonical = progress(current)
  let purchases = 0, id = ''
  app.client.transport = async (url, options) => {
    if (url.includes('/commands/')) return json(envelope({ commandId: id, revision: 2, result: { progress: canonical, hint: { type: 'reveal', message: 'Recovered hint.' } } }))
    if (options?.method === 'POST') {
      purchases++; id = JSON.parse(String(options.body)).commandId
      canonical.revision = 2; canonical.hintsUsed = canonical.currentState!.hintsUsed = canonical.currentAttempt!.hintsUsed = 1
      canonical.currentState!.inputs.m1.home = 2; canonical.currentState!.revealedCells = [{ matchId: 'm1', side: 'home' }]
      throw new Error('lost reply')
    }
    return json(envelope({ puzzle: current, progress: canonical }))
  }
  await app.runtime.start()
  const view = await render(<SafeAreaProvider><AppShell services={app} /></SafeAreaProvider>)
  await userEvent.press(screen.getByLabelText('Daily, tab, 2 of 4'))
  await userEvent.press(await screen.findByRole('button', { name: 'Hint' }))
  await userEvent.press(screen.getByRole('button', { name: 'Use 1 hint' }))
  expect(await screen.findByRole('button', { name: 'Retry the same hint' })).toBeVisible()
  await act(async () => { await app.controller.load() })
  expect(await screen.findByText('Recovered hint.')).toBeVisible()
  expect(screen.queryByText('Get one hint')).toBeNull()
  expect(purchases).toBe(1)
  await view.unmount(); app.controller.dispose()
})

test('a warm link supersedes a delayed cold link and opens only after owner hydration', async () => {
  let emit!: (event: { url: string }) => void, resolveCold!: (url: string) => void
  const listen = jest.spyOn(Linking, 'addEventListener').mockImplementation((_type, listener) => { emit = listener; return { remove: jest.fn() } })
  const initial = jest.spyOn(Linking, 'getInitialURL').mockImplementation(() => new Promise(resolve => { resolveCold = resolve }))
  const app = await services(), reads: string[] = []
  app.client.transport = async url => { reads.push(url); const current = puzzle(url.endsWith('ckscorepuzzledaily000000002') ? 'ckscorepuzzledaily000000002' : 'ckscorepuzzledaily000000003'); return json(envelope({ puzzle: current, progress: progress(current) })) }
  const view = await render(<SafeAreaProvider><AppShell services={app} /></SafeAreaProvider>)
  try {
    await act(async () => { emit({ url: `${origin}/puzzles/ckscorepuzzledaily000000002` }) })
    expect(reads.some(url => url.endsWith('/ckscorepuzzledaily000000002'))).toBe(false)
    await act(async () => { await app.runtime.start() })
    expect(await screen.findByRole('button', { name: 'Check scores' })).toBeVisible()
    expect(app.controller.getSnapshot().data!.data.puzzle.id).toBe('ckscorepuzzledaily000000002')
    await act(async () => { resolveCold(`${origin}/puzzles/ckscorepuzzledaily000000003`) })
    expect(app.controller.getSnapshot().data!.data.puzzle.id).toBe('ckscorepuzzledaily000000002')
    expect(reads.some(url => url.endsWith('/ckscorepuzzledaily000000003'))).toBe(false)
  } finally { listen.mockRestore(); initial.mockRestore(); await view.unmount(); app.controller.dispose() }
})

test('a warm link arriving during sign-in waits for the account token before opening', async () => {
  let emit!: (event: { url: string }) => void, release!: () => void
  const listen = jest.spyOn(Linking, 'addEventListener').mockImplementation((_type, listener) => { emit = listener; return { remove: jest.fn() } })
  const app = await services(), requests: Array<{ url: string; authorization: string }> = []
  app.client.transport = async (url, options) => {
    requests.push({ url, authorization: String((options?.headers as Record<string, string>)?.Authorization) })
    if (url.endsWith('/auth/login')) {
      await new Promise<void>(resolve => { release = resolve })
      const account = identity('account-one'); account.user.isAnonymous = false; account.user.email = 'player@example.invalid'; account.session.accessToken = 'account-access-token'.repeat(4)
      return json(envelope(account))
    }
    const current = puzzle('ckscorepuzzledaily000000004')
    return json(envelope({ puzzle: current, progress: progress(current) }))
  }
  await app.runtime.start()
  const view = await render(<SafeAreaProvider><AppShell services={app} /></SafeAreaProvider>)
  try {
    let pending!: Promise<void>
    await act(async () => { pending = app.runtime.authenticate('login', 'player@example.invalid', 'test-password'); await new Promise(resolve => setTimeout(resolve, 0)) })
    await act(async () => { emit({ url: `${origin}/puzzles/ckscorepuzzledaily000000004` }) })
    expect(requests.some(request => request.url.endsWith('/ckscorepuzzledaily000000004'))).toBe(false)
    await act(async () => { release(); await pending })
    expect(await screen.findByRole('button', { name: 'Check scores' })).toBeVisible()
    expect(requests.find(request => request.url.endsWith('/ckscorepuzzledaily000000004'))!.authorization).toContain('account-access-token')
    expect(app.controller.getSnapshot().identity!.id).toBe('account-one')
  } finally { listen.mockRestore(); await view.unmount(); app.controller.dispose() }
})
