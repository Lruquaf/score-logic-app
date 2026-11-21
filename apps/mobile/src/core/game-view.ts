import type { Draft, Feedback, Puzzle, Scores } from './types.ts'
export interface CheckedBoard { owner: string; puzzleId: string; attemptId: string | null; key: string; feedback: Feedback }
export function boardKey(puzzle: Puzzle, inputs: Scores) { return JSON.stringify(puzzle.matches.map(match => [match.id, inputs[match.id]?.home ?? null, inputs[match.id]?.away ?? null])) }
export function checkedFeedback(puzzle: Puzzle, draft: Draft, checked: CheckedBoard | null) {
  return checked?.owner === draft.owner && checked.puzzleId === puzzle.id && checked.attemptId === draft.attemptId && checked.key === boardKey(puzzle, draft.snapshot.inputs) ? checked.feedback : null
}
// Interpret only the disclosure mode returned by the server, never solve locally.
export function feedbackMarks(feedback: Feedback | null, matchId: string, side: 'home' | 'away') {
  return {
    cell: feedback?.mode === 'EXACT_WRONG_CELLS' && feedback.wrongCells.some(cell => cell.matchId === matchId && cell.side === side),
    match: (feedback?.mode === 'WRONG_MATCH' && feedback.wrongMatchIds.includes(matchId)) || (feedback?.mode === 'EXACT_WRONG_OUTCOMES' && feedback.wrongOutcomeMatchIds.includes(matchId))
  }
}
export function twoPanelLayout(width: number, height: number, fontScale: number) { return width >= 900 && height >= 650 && fontScale <= 1.2 }
