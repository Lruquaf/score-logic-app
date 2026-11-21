import React from 'react'
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native'
import { ScoreInput, FixtureRow, MatchNoteSheet } from '../../src/ui/game/BoardComponents'
import { AnalysisPanel, AttemptSummary, FeedbackPanel } from '../../src/ui/game/FeedbackPanel'
import type { Feedback } from '../../src/core/types'
import { mergeDraft } from '../../src/core/puzzle'
import { puzzle, progress } from '../helpers'
import { analysisFixture } from '../gameplay-fixtures'

const feedback = (mode: Feedback['mode']): Feedback => ({ mode, message: 'Your board needs adjustment.', wrongMatchIds: ['m1'], wrongCells: [{ matchId: 'm1', side: 'home' }], wrongOutcomeMatchIds: ['m1'], errorCount: 2, violations: [] })
test('score input accepts blank, zero and nineteen but rejects decimals, signs and overflow', async () => {
  const change = jest.fn(), focus = jest.fn()
  await render(<ScoreInput label="Aster home score against Cedar" value={null} status="entry" disabled={false} wrong={false} onChange={change} onFocus={focus} />)
  const input = screen.getByLabelText('Aster home score against Cedar')
  for (const value of ['', '0', '19', '1.2', '-1', '20', '123', 'ab']) await fireEvent.changeText(input, value)
  expect(change.mock.calls.map(call => call[0])).toEqual(['', '0', '19'])
  await fireEvent(input, 'focus')
  expect(focus).toHaveBeenCalledTimes(1)
})
test.each(['given', 'hint', 'answer'] as const)('%s scores stay visibly fixed and disabled', async status => {
  await render(<ScoreInput label="Aster home score against Cedar" value={0} status={status} disabled={false} wrong={false} onChange={jest.fn()} onFocus={jest.fn()} />)
  const input = screen.getByLabelText(`Aster home score against Cedar, ${status}`)
  expect(input).toBeDisabled()
  expect(input.props.value).toBe('0')
  expect(screen.getByText(status)).toBeVisible()
})
test.each(['EXACT_WRONG_CELLS', 'WRONG_MATCH', 'ERROR_COUNT', 'CORRECTNESS_ONLY', 'EXACT_WRONG_OUTCOMES', 'CONSTRAINT_VIOLATIONS'] as const)('renders only allowed disclosure for %s', async mode => {
  const current = puzzle(), snapshot = mergeDraft(current, progress(current), 'owner', null).snapshot
  await render(<><FeedbackPanel feedback={feedback(mode)} /><FixtureRow puzzle={current} match={current.matches[1]} snapshot={snapshot} feedback={feedback(mode)} disabled={false} onScore={jest.fn()} onFocus={jest.fn()} onNote={jest.fn()} register={jest.fn()} /></>)
  expect(screen.getByText('Your board needs adjustment.')).toBeVisible()
  expect(screen.queryByText('Adjust score') !== null).toBe(mode === 'EXACT_WRONG_CELLS')
  expect(screen.queryByText('Check this fixture.') !== null).toBe(mode === 'WRONG_MATCH')
  expect(screen.queryByText('Check the match result.') !== null).toBe(mode === 'EXACT_WRONG_OUTCOMES')
  expect(screen.queryByText('Wrong score boxes: 2') !== null).toBe(mode === 'ERROR_COUNT')
})
test('match note editor exposes its limit and requires the Save action', async () => {
  const save = jest.fn(), change = jest.fn()
  await render(<MatchNoteSheet value="Deduction" disabled={false} onChange={change} onSave={save} />)
  expect(screen.getByLabelText('Your match note').props.maxLength).toBe(180)
  await userEvent.press(screen.getByRole('button', { name: 'Save note' }))
  expect(save).toHaveBeenCalledTimes(1)
})
test.each(['SAT', 'UNSAT', 'UNKNOWN'] as const)('analysis explains %s without silently marking UNKNOWN incorrect', async status => {
  await render(<AnalysisPanel puzzle={puzzle()} data={analysisFixture(status)} stale={false} />)
  expect(screen.getByText(status === 'SAT' ? 'At least one complete solution remains.' : status === 'UNSAT' ? 'No completion can keep all of these entries unchanged.' : 'The analysis is inconclusive. Your entries have not been marked wrong.')).toBeVisible()
})
test('an old analysis is replaced by a clear stale-snapshot message', async () => {
  await render(<AnalysisPanel puzzle={puzzle()} data={analysisFixture('UNSAT')} stale />)
  expect(screen.getByText('Board changed')).toBeVisible()
  expect(screen.queryByText('No completion can keep all of these entries unchanged.')).toBeNull()
})
test('replay distinguishes current, official, first and best results without replacing them', async () => {
  const current = progress(puzzle())
  current.currentAttempt!.kind = 'REPLAY'
  current.timeTakenSec = 90
  current.firstAttempt = { ...current.currentAttempt!, kind: 'STANDARD', status: 'SOLVED', elapsedTimeSec: 90 }
  current.bestAttempt = { ...current.firstAttempt, elapsedTimeSec: 60, hintsUsed: 1 }
  await render(<AttemptSummary progress={current} />)
  expect(screen.getByText('Replay attempt')).toBeVisible()
  expect(screen.getByText('Official saved result: 01:30')).toBeVisible()
  expect(screen.getByText('Best solved attempt: 01:00 · 1 hints')).toBeVisible()
})
