import React from 'react'
import { Text, View } from 'react-native'
import type { BoardAnalysis, Feedback, Progress, Puzzle } from '../../core/types'
import { formatDuration } from '../../core/puzzle'
import { Heading, styles } from '../primitives'

export function FeedbackPanel({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null
  const details = { EXACT_WRONG_CELLS: 'The marked score boxes need adjustment.', WRONG_MATCH: 'The marked fixtures contain at least one wrong score.', EXACT_WRONG_OUTCOMES: 'The marked fixtures have the wrong result.', ERROR_COUNT: 'This pack only reports the number of wrong score boxes.', CORRECTNESS_ONLY: 'This pack only reports whether the full board is correct.', CONSTRAINT_VIOLATIONS: 'Review the listed teams and adjust your scores.' }
  return <View accessibilityLiveRegion="polite" style={styles.feature}><Text accessibilityRole="header" style={styles.body}>{feedback.message}</Text><Text style={styles.secondary}>{details[feedback.mode as keyof typeof details]}</Text>{feedback.mode === 'ERROR_COUNT' && feedback.errorCount !== null && <Text style={styles.body}>Wrong score boxes: {feedback.errorCount}</Text>}{feedback.mode === 'CONSTRAINT_VIOLATIONS' && feedback.violations.map((item, index) => <Text key={index} style={styles.body}>{item.message}</Text>)}</View>
}
export function AnalysisPanel({ data, puzzle, stale }: { data: BoardAnalysis; puzzle: Puzzle; stale: boolean }) {
  if (stale) return <View style={styles.feature}><Heading>Board changed</Heading><Text style={styles.body}>This analysis belongs to earlier entries. Analyze again to check the current board.</Text></View>
  const status = data.analysis.satisfiability.status
  return <View style={{ gap: 16 }}><Heading>{data.mode === 'GUIDED' ? 'Guided analysis' : 'Assisted analysis'}</Heading><Text accessibilityRole="alert" style={styles.body}>{status === 'SAT' ? 'At least one complete solution remains.' : status === 'UNSAT' ? 'No completion can keep all of these entries unchanged.' : 'The analysis is inconclusive. Your entries have not been marked wrong.'}</Text><Text style={styles.secondary}>Snapshot only. This does not submit your answer or reveal a score.</Text><Text style={styles.body}>{data.analysis.completedMatchCount} complete fixtures · {data.analysis.partialMatchCount} partial · {data.analysis.remainingMatchCount} remaining</Text>
    {data.analysis.issues.map((issue, index) => <Text key={index} style={styles.body}>{issue.message}</Text>)}
    {data.analysis.teams.map(team => <View key={team.teamId} style={styles.feature}><Text accessibilityRole="header" style={styles.body}>{puzzle.teams.find(item => item.id === team.teamId)?.nameEn}</Text>{(['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'points'] as const).map(metric => <Text key={metric} style={styles.secondary}>{({ played: 'Played', won: 'Won', drawn: 'Drawn', lost: 'Lost', goalsFor: 'Goals for', goalsAgainst: 'Goals against', points: 'Points' })[metric]}: target {team.target[metric]}, entered {team.entered[metric]}, remaining {team.remaining[metric]}</Text>)}</View>)}
  </View>
}
export function AttemptSummary({ progress }: { progress: Progress | null }) {
  if (!progress?.currentAttempt) return null
  const attempt = progress.currentAttempt
  return <View style={{ gap: 8 }}><Text style={styles.eyebrow}>{attempt.kind === 'REPLAY' ? 'Replay attempt' : 'Standard attempt'}</Text>{attempt.status === 'REVEALED' && <Text accessibilityRole="alert" style={styles.body}>Answer revealed. This assisted attempt does not unlock the next level.</Text>}{progress.timeTakenSec !== null && <Text style={styles.secondary}>Official saved result: {formatDuration(progress.timeTakenSec)}</Text>}{progress.firstAttempt && <Text style={styles.secondary}>First attempt: {progress.firstAttempt.status.toLowerCase()}{progress.firstAttempt.status === 'ACTIVE' ? '' : ` · ${formatDuration(progress.firstAttempt.elapsedTimeSec)}`}</Text>}{progress.bestAttempt && <Text style={styles.secondary}>Best solved attempt: {formatDuration(progress.bestAttempt.elapsedTimeSec)} · {progress.bestAttempt.hintsUsed} hints</Text>}{attempt.kind === 'REPLAY' && <Text style={styles.secondary}>Your saved completion and unlocked levels stay protected.</Text>}</View>
}
