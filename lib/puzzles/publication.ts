import { createHash } from 'node:crypto'

import type { PuzzlePrivateDTO } from '@/lib/contracts/puzzle'
import {
  assertPuzzleContentQuality,
  type PuzzleContentQualityOptions
} from '@/lib/puzzles/contentQuality'
import { assertValidPuzzleDomain } from '@/lib/puzzles/domainValidation'
import { selectInitialRevealedMatches } from '@/lib/puzzles/prefill'

export const PUZZLE_GENERATOR_VERSION = 'scorelogic-generator-v1'
export const PUZZLE_RULES_VERSION = 'solve-any-v1'
const CONTENT_VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)])
    )
  }

  return value
}

export function buildPuzzleContentHash(puzzle: PuzzlePrivateDTO) {
  // Presentation/effective difficulty are deterministic projections of the
  // hashed table score and mode metadata. Keeping them outside the immutable
  // payload preserves revision hashes while publication validation prevents
  // derived metadata from drifting.
  const immutableContent = {
    id: puzzle.id,
    mode: puzzle.mode,
    difficulty: puzzle.difficulty,
    inferenceSteps: puzzle.inferenceSteps,
    teams: puzzle.teams,
    standings: puzzle.standings,
    matches: puzzle.matches,
    solution: puzzle.solution,
    allSolutions: puzzle.allSolutions,
    dailyDate: puzzle.dailyDate,
    campaignOrder: puzzle.campaignOrder,
    campaignPack: puzzle.campaignPack,
    campaignLevel: puzzle.campaignLevel,
    tableDifficultyScore: puzzle.tableDifficultyScore,
    solutionCount: puzzle.solutionCount
  }

  return createHash('sha256')
    .update(JSON.stringify(canonicalize(immutableContent)))
    .digest('hex')
}

export function buildPuzzleContentKey(
  puzzle: Pick<
    PuzzlePrivateDTO,
    'mode' | 'dailyDate' | 'campaignPack' | 'campaignLevel'
  >
) {
  if (puzzle.mode === 'daily' && puzzle.dailyDate) {
    return `daily:${puzzle.dailyDate}`
  }

  if (puzzle.mode === 'campaign' && puzzle.campaignPack && puzzle.campaignLevel) {
    return `campaign:${puzzle.campaignPack.toLowerCase()}:${puzzle.campaignLevel}`
  }

  throw new Error('Cannot build a content key from incomplete puzzle metadata.')
}

export function buildPuzzleRevisionId(baseId: string, revision: number) {
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error('Puzzle content revision must be a positive integer.')
  }

  return revision === 1
    ? baseId
    : `${baseId}rev${String(revision).padStart(3, '0')}`
}

export function materializePuzzleRevision(
  puzzle: PuzzlePrivateDTO,
  revision: number
): PuzzlePrivateDTO {
  const id = buildPuzzleRevisionId(puzzle.id, revision)
  const revisionPuzzle: PuzzlePrivateDTO = {
    ...puzzle,
    id,
    teams: puzzle.teams.map((team) => ({ ...team })),
    standings: puzzle.standings.map((standing) => ({ ...standing })),
    matches: puzzle.matches.map((match) => ({ ...match })),
    solution: puzzle.solution.map((match) => ({ ...match })),
    allSolutions: puzzle.allSolutions.map((solution) =>
      solution.map((match) => ({ ...match }))
    ),
    initialRevealedMatches: []
  }

  revisionPuzzle.initialRevealedMatches =
    selectInitialRevealedMatches(revisionPuzzle)

  return revisionPuzzle
}

export function buildPuzzleContentVersion(
  puzzle: PuzzlePrivateDTO,
  revision = 1
) {
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error('Puzzle content revision must be a positive integer.')
  }

  if (puzzle.mode === 'daily' && puzzle.dailyDate) {
    return `daily-${puzzle.dailyDate}-v${revision}`
  }

  if (puzzle.mode === 'campaign' && puzzle.campaignPack && puzzle.campaignLevel) {
    return `campaign-${puzzle.campaignPack.toLowerCase()}-${puzzle.campaignLevel}-v${revision}`
  }

  throw new Error('Cannot build a content version from incomplete puzzle metadata.')
}

function buildPuzzlePublicationMetadata(
  puzzle: PuzzlePrivateDTO,
  contentVersion: string
) {
  return {
    contentVersion,
    generatorVersion: PUZZLE_GENERATOR_VERSION,
    rulesVersion: PUZZLE_RULES_VERSION,
    contentHash: buildPuzzleContentHash(puzzle),
    publishedAt: new Date()
  }
}

export function preparePuzzleForPublication(
  puzzle: PuzzlePrivateDTO,
  contentVersion: string,
  qualityOptions: PuzzleContentQualityOptions = {}
) {
  assertValidPuzzleDomain(puzzle, 'publication')
  const qualityReport = assertPuzzleContentQuality(puzzle, qualityOptions)

  if (!CONTENT_VERSION_PATTERN.test(contentVersion)) {
    throw new Error(
      'Puzzle contentVersion must be a lowercase, non-empty, URL-safe version identifier.'
    )
  }

  const versionPrefix = buildPuzzleContentVersion(puzzle).slice(0, -1)
  const revision = contentVersion.slice(versionPrefix.length)
  if (
    !contentVersion.startsWith(versionPrefix) ||
    !/^[1-9]\d*$/.test(revision)
  ) {
    throw new Error(
      `Puzzle contentVersion must match its identity prefix "${versionPrefix}<revision>".`
    )
  }

  return {
    metadata: buildPuzzlePublicationMetadata(puzzle, contentVersion),
    qualityReport
  }
}
