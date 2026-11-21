import React from 'react'
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { nativeSessionDataSchema } from '@scorelogic/contracts'
import { AppShell } from '../../src/ui/AppShell'
import { SessionClient } from '../../src/core/session'
import { PuzzleController } from '../../src/core/controller'
import { LifecycleCoordinator, MobileRuntime } from '../../src/core/runtime'
import { analysisFixture } from '../gameplay-fixtures'
import { envelope, identity, json, origin, progress, puzzle, random, store, vault, clone } from '../helpers'

async function setup() {
  const current = puzzle(); current.mode = 'campaign'; current.campaignPack = 'BEGINNER'; current.campaignLevel = 1
  const canonical = progress(current), database = store(), saved = vault(), rng = random()
  for (const match of current.matches) canonical.currentState!.inputs[match.id] = { home: 0, away: 0 }
  canonical.currentState!.inputs.m0.home = 2
  canonical.currentState!.notes.m1 = { home: 'Keep home note', away: 'Keep away note', match: '' }
  await saved.set('session', identity())
  const commands: string[] = []
  const client = new SessionClient(origin, saved, rng, nativeSessionDataSchema, async (url, options) => {
    if (url.endsWith('/puzzles/campaign')) return json(envelope({ puzzles: [{ id: current.id, contentKey: 'campaign:beginner:1', difficulty: 'MEDIUM', effectiveDifficulty: 'MEDIUM', campaignOrder: 1, campaignPack: 'BEGINNER', campaignLevel: 1, isUnlocked: true }], progress: [] }))
    if (url.endsWith('/analyze')) return json(envelope(analysisFixture('UNKNOWN')))
    if (url.endsWith('/commands')) {
      const body = JSON.parse(String(options?.body)); commands.push(body.type); canonical.revision++
      if (body.type === 'submit') {
        canonical.currentState!.inputs = clone(body.payload.inputs)
        return json(envelope({ commandId: body.commandId, revision: canonical.revision, result: { progress: canonical, isCorrect: false, feedback: { mode: 'EXACT_WRONG_CELLS', message: 'Adjust your home score.', wrongCells: [{ matchId: 'm1', side: 'home' }], wrongMatchIds: [], wrongOutcomeMatchIds: [], errorCount: 1, violations: [] } } }))
      }
      if (body.type === 'progress') canonical.currentState = clone(body.payload.progress)
      return json(envelope({ commandId: body.commandId, revision: canonical.revision, result: { progress: canonical } }))
    }
    return json(envelope({ puzzle: current, progress: canonical }))
  })
  const controller = new PuzzleController(client, database, rng), runtime = new MobileRuntime(client, database, controller)
  await runtime.start()
  const services = { client, controller, runtime, lifecycle: new LifecycleCoordinator(controller), config: { apiOrigin: origin, webOrigin: origin, scheme: 'scorelogic-dev' } }
  const view = await render(<SafeAreaProvider><AppShell services={services} /></SafeAreaProvider>)
  await userEvent.press(screen.getByLabelText('Campaign, tab, 3 of 4'))
  await userEvent.press(await screen.findByRole('button', { name: 'Level 1, open' }))
  await screen.findByRole('button', { name: 'Check scores' })
  return { services, view, commands }
}
test('Check marks the server-selected cell, editing clears feedback and exposes keyboard controls', async () => {
  const h = await setup()
  try {
    await userEvent.press(screen.getByRole('button', { name: 'Check scores' }))
    expect(await screen.findByText('Adjust score')).toBeVisible()
    const input = screen.getByLabelText('Aster home score against Cedar, adjust this score after Check')
    await fireEvent.changeText(input, '19')
    expect(screen.queryByText('Adjust score')).toBeNull()
    await fireEvent(input, 'focus')
    expect(screen.getByRole('button', { name: 'Next score' })).toBeVisible()
    await userEvent.press(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('button', { name: 'Next score' })).toBeNull()
    expect(h.commands.filter(type => type === 'submit')).toHaveLength(1)
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})
test('Analyze presents UNKNOWN honestly; saving a note leaves score and existing side notes intact', async () => {
  const h = await setup()
  try {
    await userEvent.press(screen.getByRole('button', { name: 'Analyze board' }))
    expect(await screen.findByText('The analysis is inconclusive. Your entries have not been marked wrong.')).toBeVisible()
    await userEvent.press(screen.getByRole('button', { name: 'Close' }))
    const before = clone(h.services.controller.getSnapshot().draft!.snapshot.inputs)
    await userEvent.press(screen.getByRole('button', { name: 'Note · AST vs CED' }))
    await fireEvent.changeText(screen.getByLabelText('Your match note'), 'One new deduction')
    await userEvent.press(screen.getByRole('button', { name: 'Save note' }))
    expect(await screen.findByText('Note: One new deduction')).toBeVisible()
    expect(h.services.controller.getSnapshot().draft!.snapshot.inputs).toEqual(before)
    expect(h.services.controller.getSnapshot().draft!.snapshot.notes.m1).toEqual({ home: 'Keep home note', away: 'Keep away note', match: 'One new deduction' })
    expect(h.commands.filter(type => type === 'hint' || type === 'submit')).toHaveLength(0)
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})

test('lost Reveal reply stays understandable inside the sheet and one retry confirms the same command', async () => {
  const h = await setup(), current = h.services.controller.getSnapshot().data!.data.puzzle
  const canonical = clone(h.services.controller.getSnapshot().data!.data.progress!)
  let commandId = '', posts = 0
  h.services.client.transport = async (url, options) => {
    if (url.includes('/commands/')) return json(envelope({ commandId, revision: canonical.revision, result: { progress: canonical } }))
    if (url.endsWith('/commands') && options?.method === 'POST') {
      posts++; commandId = JSON.parse(String(options.body)).commandId
      canonical.revision++; canonical.currentAttempt!.status = 'REVEALED'
      canonical.answerRevealed = canonical.currentState!.answerRevealed = true
      throw new Error('deliberately lost committed reveal reply')
    }
    return json(envelope({ puzzle: current, progress: canonical }))
  }
  try {
    await userEvent.press(screen.getByRole('button', { name: 'More' }))
    await userEvent.press(screen.getByRole('button', { name: 'Reveal answer' }))
    await userEvent.press(screen.getByRole('button', { name: 'Reveal answer' }))
    expect(await screen.findByText('Your original operation is unconfirmed. Retry confirmation checks the same action.')).toBeVisible()
    await userEvent.press(screen.getByRole('button', { name: 'Retry confirmation' }))
    expect(await screen.findByText('Answer revealed. This assisted attempt does not unlock the next level.')).toBeVisible()
    expect(screen.queryByText('Reveal the answer?')).toBeNull()
    expect(posts).toBe(1)
  } finally { await h.view.unmount(); h.services.controller.dispose() }
})
