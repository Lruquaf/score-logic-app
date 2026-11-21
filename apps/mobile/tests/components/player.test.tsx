import React from 'react'
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { Dimensions, Share } from 'react-native'
import { nativeSessionDataSchema } from '@scorelogic/contracts'
import { AppShell } from '../../src/ui/AppShell'
import { SessionClient } from '../../src/core/session'
import { PuzzleController } from '../../src/core/controller'
import { LifecycleCoordinator, MobileRuntime } from '../../src/core/runtime'
import { envelope, identity, json, origin, progress, puzzle, random, store, vault, clone } from '../helpers'

async function setup(options: { solved?: boolean; wrongLogin?: boolean; openBoundary?: boolean } = {}) {
  const saved = vault(), database = store(), rng = random(), current = puzzle(), canonical = progress(current)
  let user = identity(), loginFails = Boolean(options.wrongLogin)
  const authBodies: Record<string, unknown>[] = [], deleteBodies: Record<string, unknown>[] = [], reads: string[] = []
  if (options.solved) { canonical.currentAttempt!.status = 'SOLVED'; canonical.currentAttempt!.elapsedTimeSec = 125; canonical.currentAttempt!.hintsUsed = 2; canonical.currentState!.notes.m1 = { home: '', away: '', match: 'private deduction' } }
  const packs = ['BEGINNER', 'EASY', 'MEDIUM', 'HARD', 'EXPERT']
  const catalog = packs.flatMap((pack, index) => Array.from({ length: 30 }, (_, level) => ({ id: `ckscorepuzzlecamp${String(index * 30 + level + 1).padStart(9, '0')}`, contentKey: `campaign:${pack.toLowerCase()}:${level + 1}`, campaignPack: pack, campaignLevel: level + 1, campaignOrder: index * 30 + level + 1, difficulty: 'EASY', effectiveDifficulty: 'EASY', isUnlocked: level === 0 })))
  if (options.openBoundary) catalog[29].isUnlocked = true
  await saved.set('session', user)
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async (url, request) => {
    reads.push(url)
    if (url.endsWith('/auth/login') || url.endsWith('/auth/register')) {
      authBodies.push(JSON.parse(String(request?.body)))
      if (loginFails) { loginFails = false; return json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } }, 401) }
      user = identity('account-one'); user.user.email = 'player@example.invalid'; user.user.isAnonymous = false
      return json(envelope(user))
    }
    if (url.endsWith('/account/delete')) { deleteBodies.push(JSON.parse(String(request?.body))); return json(envelope({ deleted: true })) }
    if (url.endsWith('/puzzles/campaign')) return json(envelope({ puzzles: catalog, progress: [] }))
    if (url.includes('/user/progress')) return json(envelope({ user: { userId: user.user.id, isAnonymous: user.user.isAnonymous }, progress: { totalStarted: 6, totalCompleted: 2, byStatus: { IN_PROGRESS: 4, COMPLETED: 2, ABANDONED: 0 }, entries: catalog.slice(0, 6).map((item, index) => ({ puzzleId: item.id, status: index < 2 ? 'COMPLETED' : 'IN_PROGRESS', attempts: index + 1, hintsUsed: index, answerRevealed: false, answerRevealedAt: null, timeTakenSec: index < 2 ? 125 : null, completedAt: null, updatedAt: new Date().toISOString(), puzzle: { id: item.id, contentKey: item.contentKey, mode: 'campaign', difficulty: 'EASY', dailyDate: null, campaignOrder: item.campaignOrder, campaignPack: item.campaignPack, campaignLevel: item.campaignLevel } })), pageInfo: { limit: 6, hasMore: false, nextCursor: null } } }))
    if (url.endsWith('/user/stats')) return json(envelope({ user: { userId: user.user.id, isAnonymous: user.user.isAnonymous }, stats: { totalSolved: 2, successfulAttempts: 2, totalAttempts: 8, firstTrySolves: 1, assistedSolves: 1, answerReveals: 0, perfectSolves: 1, totalTimeSec: 250, bestDurationSec: 125, solvedEasy: 2, solvedMedium: 0, solvedHard: 0, currentStreak: 1, bestStreak: 2, avgTimeSec: 125 } }))
    if (url.endsWith('/commands')) { const body = JSON.parse(String(request?.body)); canonical.revision++; if (body.type === 'progress') canonical.currentState = clone(body.payload.progress); return json(envelope({ commandId: body.commandId, revision: canonical.revision, result: { progress: canonical } })) }
    if (url.endsWith('/puzzles/daily')) return json(envelope({ puzzle: current, progress: canonical }))
    const target = catalog.find(item => url.endsWith(`/${item.id}`))
    return json(envelope({ puzzle: target ? { ...current, id: target.id, mode: 'campaign', dailyDate: null, campaignPack: target.campaignPack, campaignLevel: target.campaignLevel, campaignOrder: target.campaignOrder } : current, progress: target ? { ...canonical, puzzleId: target.id, currentState: { ...canonical.currentState, puzzleId: target.id } } : canonical }))
  })
  const controller = new PuzzleController(client, database, rng), runtime = new MobileRuntime(client, database, controller)
  await runtime.start()
  const services = { client, controller, runtime, lifecycle: new LifecycleCoordinator(controller), config: { apiOrigin: origin, webOrigin: origin, scheme: 'scorelogic-dev' } }
  const view = await render(<SafeAreaProvider><AppShell services={services} /></SafeAreaProvider>)
  return { services, view, authBodies, deleteBodies, reads }
}
test('Home previews the public daily without starting an attempt', async () => {
  const h = await setup()
  try {
    expect(await screen.findByText(/Daily · 2026-11-13/)).toBeVisible()
    expect(h.reads.some(url => url.endsWith('/commands'))).toBe(false)
    await userEvent.press(screen.getByRole('button', { name: 'How to play' }))
    expect(await screen.findByText(/P, W, D and L mean/)).toBeVisible()
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})
test('five packs show thirty levels; locked levels explain access without opening a puzzle', async () => {
  const h = await setup()
  try {
    await userEvent.press(screen.getByLabelText('Campaign, tab, 3 of 4'))
    await screen.findByRole('button', { name: 'Level 1, open' })
    expect(screen.getAllByRole('button', { name: /Level \d+, (open|locked)/ })).toHaveLength(30)
    await userEvent.press(screen.getByRole('button', { name: 'expert pack' }))
    expect(screen.getByRole('button', { name: 'expert pack', selected: true })).toBeVisible()
    const before = h.reads.length
    await userEvent.press(screen.getByRole('button', { name: 'Level 2, locked' }))
    expect(screen.getByText(/Solve level 1 in this pack/)).toBeVisible()
    expect(h.reads.length).toBe(before)
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})
test('campaign next and previous cross pack boundaries but cannot bypass locked neighbors', async () => {
  const h = await setup({ openBoundary: true })
  try {
    await userEvent.press(screen.getByLabelText('Campaign, tab, 3 of 4'))
    await userEvent.press(await screen.findByRole('button', { name: 'Level 30, open' }))
    expect(await screen.findByRole('button', { name: 'Previous level' })).toBeDisabled()
    await userEvent.press(screen.getByRole('button', { name: 'Next level' }))
    await waitFor(() => expect(h.services.controller.getSnapshot().data?.data.puzzle.campaignPack).toBe('EASY'))
    expect(await screen.findByRole('button', { name: 'Next level' })).toBeDisabled()
    await userEvent.press(screen.getByRole('button', { name: 'Previous level' }))
    await waitFor(() => expect(h.services.controller.getSnapshot().data?.data.puzzle.campaignLevel).toBe(30))
    expect(h.services.controller.getSnapshot().data!.data.puzzle.campaignPack).toBe('BEGINNER')
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})
test('successful registration returns to the original campaign tab', async () => {
  const h = await setup()
  try {
    await userEvent.press(screen.getByLabelText('Campaign, tab, 3 of 4'))
    await screen.findByRole('button', { name: 'Level 1, open' })
    await userEvent.press(screen.getByRole('button', { name: 'Open account' }))
    await userEvent.press(screen.getByRole('button', { name: 'Create account' }))
    await fireEvent.changeText(screen.getByLabelText('Email'), 'player@example.invalid')
    await fireEvent.changeText(screen.getByLabelText('Password'), 'test-password')
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'test-password')
    await userEvent.press(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('button', { name: 'Level 1, open' })).toBeVisible()
    expect(h.services.runtime.getSnapshot().identity!.isAnonymous).toBe(false)
    expect(h.authBodies).toHaveLength(1)
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})
test('Stats displays every metric and the latest six records with canonical times', async () => {
  const h = await setup()
  try {
    await userEvent.press(screen.getByLabelText('Stats, tab, 4 of 4'))
    expect(await screen.findByText('Perfect solves')).toBeVisible()
    for (const label of ['Successful attempts', 'Total attempts', 'First-try solves', 'Assisted solves', 'Answers revealed', 'Total solve time', 'Best solve time', 'Easy solved', 'Medium solved', 'Hard solved', 'Current streak', 'Best streak', 'Average solve time']) expect(screen.getByText(label)).toBeVisible()
    expect(await screen.findAllByRole('button', { name: /^Open .+ puzzle$/ })).toHaveLength(6)
    expect(screen.getAllByText('Official saved time: 02:05')).toHaveLength(2)
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})
test('a rejected sign-in remains editable and a successful retry returns to the original daily', async () => {
  const h = await setup({ wrongLogin: true })
  try {
    await userEvent.press(screen.getByLabelText('Daily, tab, 2 of 4'))
    await screen.findByRole('button', { name: 'Check scores' })
    await userEvent.press(screen.getByRole('button', { name: 'Open account' }))
    await userEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    await fireEvent.changeText(screen.getByLabelText('Email'), 'player@example.invalid')
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Email or password is incorrect.')).toBeVisible()
    expect(screen.getByLabelText('Email').props.value).toBe('player@example.invalid')
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct-password')
    await userEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('button', { name: 'Check scores' })).toBeVisible()
    expect(h.services.runtime.getSnapshot().identity!.email).toBe('player@example.invalid')
    expect(h.authBodies[1].guestBarrier).toEqual({ commandsSettled: true, draftsSynced: true })
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})
test('registration checks confirmation; guest continuation returns without an auth request', async () => {
  const h = await setup()
  try {
    await userEvent.press(screen.getByRole('button', { name: 'Open account' }))
    await userEvent.press(screen.getByRole('button', { name: 'Create account' }))
    await fireEvent.changeText(screen.getByLabelText('Email'), 'player@example.invalid')
    await fireEvent.changeText(screen.getByLabelText('Password'), 'test-password')
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'different-password')
    await userEvent.press(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('The passwords do not match.')).toBeVisible()
    expect(h.authBodies).toHaveLength(0)
    await userEvent.press(screen.getByRole('button', { name: 'Continue as guest' }))
    expect(await screen.findByText('Your next clever move.')).toBeVisible()
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})
test('guest deletion needs explicit confirmation and shows verified completion without another guest bootstrap', async () => {
  const h = await setup()
  try {
    await userEvent.press(screen.getByRole('button', { name: 'Open account' }))
    await userEvent.press(screen.getByRole('button', { name: 'Delete guest data' }))
    expect(screen.getByRole('button', { name: 'Permanently delete my data' })).toBeDisabled()
    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE')
    await userEvent.press(screen.getByRole('button', { name: 'Permanently delete my data' }))
    expect(await screen.findByText('Your data has been deleted')).toBeVisible()
    expect(h.deleteBodies).toHaveLength(1)
    expect(h.deleteBodies[0].deletionSecret).toHaveLength(43)
    expect(h.reads.some(url => url.endsWith('/auth/guest'))).toBe(false)
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})
test('share failure keeps a selectable invitation with official attempt values and no notes; cancel does not change the result', async () => {
  const h = await setup({ solved: true })
  const share = jest.spyOn(Share, 'share').mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({ action: Share.dismissedAction, activityType: undefined })
  try {
    await userEvent.press(screen.getByLabelText('Daily, tab, 2 of 4'))
    await userEvent.press(await screen.findByRole('button', { name: 'Share result' }))
    expect(await screen.findByText(/Could not open sharing. Select and copy/)).toBeVisible()
    const text = screen.getByLabelText('Your puzzle invitation')
    expect(text.props.selectable).toBe(true)
    expect(text.props.children).toContain('02:05 · Hints: 2')
    expect(text.props.children).toContain(`/puzzles/${puzzle().id}`)
    expect(text.props.children).not.toContain('private deduction')
    await userEvent.press(screen.getByRole('button', { name: 'Share result' }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2))
    expect(h.services.controller.getSnapshot().data!.data.progress!.currentAttempt!.status).toBe('SOLVED')
  } finally { share.mockRestore(); await h.view.unmount(); h.services.controller.dispose() }
})

test('copy invitation uses an explicit clipboard write with canonical values and reports failures without changing progress', async () => {
  const h = await setup({ solved: true })
  const copy = jest.mocked(Clipboard.setStringAsync)
  copy.mockClear(); copy.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('clipboard unavailable')).mockResolvedValueOnce(false)
  try {
    await userEvent.press(screen.getByLabelText('Daily, tab, 2 of 4'))
    await userEvent.press(await screen.findByRole('button', { name: 'Copy invitation' }))
    expect(await screen.findByText('Invitation copied. Paste it to challenge a friend.')).toBeVisible()
    expect(copy.mock.calls[0][0]).toContain('02:05 · Hints: 2')
    expect(copy.mock.calls[0][0]).not.toContain('private deduction')
    await userEvent.press(screen.getByRole('button', { name: 'Copy invitation' }))
    expect(await screen.findByText('Could not copy. Use Share result or select the invitation text.')).toBeVisible()
    await userEvent.press(screen.getByRole('button', { name: 'Copy invitation' }))
    expect(await screen.findByText('Could not copy. Use Share result or select the invitation text.')).toBeVisible()
    expect(copy).toHaveBeenCalledTimes(3)
    expect(h.services.controller.getSnapshot().data!.data.progress!.currentAttempt!.status).toBe('SOLVED')
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})

test('tablet resize and fold-sized reflow preserve the current draft and attempt without another command', async () => {
  const h = await setup(), window = Dimensions.get('window'), device = Dimensions.get('screen')
  try {
    await userEvent.press(screen.getByLabelText('Daily, tab, 2 of 4'))
    await screen.findByRole('button', { name: 'Check scores' })
    await act(async () => { h.services.controller.setScore('m1', 'home', '9'); h.services.controller.setNote('m1', 'Preserve on fold'); await h.services.controller.onBackground() })
    const attempt = h.services.controller.getSnapshot().draft!.attemptId, writes = h.reads.filter(url => url.endsWith('/commands')).length
    for (const [width, height, fontScale] of [[1024, 768, 1], [375, 812, 1], [540, 720, 2]]) {
      await act(async () => { Dimensions.set({ window: { ...window, width, height, fontScale }, screen: device }) })
      const draft = h.services.controller.getSnapshot().draft!
      expect(draft.attemptId).toBe(attempt); expect(draft.snapshot.inputs.m1.home).toBe(9)
      expect(draft.snapshot.notes.m1.match).toBe('Preserve on fold')
      expect(h.services.controller.getSnapshot().localSaved).toBe(true)
    }
    expect(h.reads.filter(url => url.endsWith('/commands'))).toHaveLength(writes)
  } finally { await act(async () => { Dimensions.set({ window, screen: device }) }); await h.view.unmount(); h.services.controller.dispose() }
})

test('account fields have visible labels and hardware submit uses the same validated register action', async () => {
  const h = await setup()
  try {
    await userEvent.press(screen.getByRole('button', { name: 'Open account' }))
    await userEvent.press(screen.getByRole('button', { name: 'Create account' }))
    for (const text of ['Email', 'Password', 'Confirm password']) expect(screen.getByText(text, { exact: true })).toBeVisible()
    await fireEvent.changeText(screen.getByLabelText('Email'), 'player@example.invalid')
    await fireEvent.changeText(screen.getByLabelText('Password'), 'test-password')
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'test-password')
    await fireEvent(screen.getByLabelText('Confirm password'), 'submitEditing')
    expect(await screen.findByText('Your next clever move.')).toBeVisible()
    expect(h.authBodies).toHaveLength(1)
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})
