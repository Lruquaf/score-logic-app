import type { BoardAnalysis } from '../src/core/types.ts'
import { puzzle } from './helpers.ts'
export function analysisFixture(status: 'SAT' | 'UNSAT' | 'UNKNOWN' = 'SAT'): BoardAnalysis {
  const metrics = { played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 3, goalsAgainst: 3, points: 4 }
  return { mode: 'GUIDED', analysis: { completedMatchCount: 1, partialMatchCount: 0, remainingMatchCount: 5, fixedCellCount: 2, teams: puzzle().teams.map(team => ({ teamId: team.id, target: metrics, entered: { ...metrics, played: 1 }, remaining: { ...metrics, played: 2 } })), violations: [], issues: [], satisfiability: { status, terminationReason: status === 'UNKNOWN' ? 'TIMEOUT' : 'EXHAUSTED', exhaustive: status !== 'UNKNOWN', completionExists: status === 'UNKNOWN' ? null : status === 'SAT' } } }
}
