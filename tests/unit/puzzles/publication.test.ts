import { sampleDailyPuzzlePrivate } from '@/lib/fixtures/samplePuzzle'
import {
  buildPuzzleContentKey,
  buildPuzzleContentHash,
  buildPuzzleContentVersion,
  buildPuzzleRevisionId,
  materializePuzzleRevision,
  preparePuzzleForPublication
} from '@/lib/puzzles/publication'

describe('puzzle publication metadata', () => {
  it('produces a stable hash for equivalent puzzle content', () => {
    const first = buildPuzzleContentHash(sampleDailyPuzzlePrivate)
    const second = buildPuzzleContentHash({
      ...sampleDailyPuzzlePrivate,
      teams: sampleDailyPuzzlePrivate.teams.map((team) => ({ ...team }))
    })

    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(second).toBe(first)
  })

  it('changes the hash when published solution content changes', () => {
    const changed = {
      ...sampleDailyPuzzlePrivate,
      solution: sampleDailyPuzzlePrivate.solution.map((match, index) =>
        index === 0
          ? { ...match, homeScore: match.homeScore + 1 }
          : match
      )
    }

    expect(buildPuzzleContentHash(changed)).not.toBe(
      buildPuzzleContentHash(sampleDailyPuzzlePrivate)
    )
  })

  it('keeps derived difficulty projections outside the immutable content hash', () => {
    const changedProjection = {
      ...sampleDailyPuzzlePrivate,
      effectiveDifficulty: 'HARD' as const,
      presentationDifficultyScore: 999,
      effectiveDifficultyScore: 999
    }

    expect(buildPuzzleContentHash(changedProjection)).toBe(
      buildPuzzleContentHash(sampleDailyPuzzlePrivate)
    )
  })

  it('separates the stable logical key from physical revision identity', () => {
    const revision = materializePuzzleRevision(sampleDailyPuzzlePrivate, 2)

    expect(buildPuzzleContentKey(revision)).toBe('daily:2026-06-17')
    expect(revision.id).toBe(
      buildPuzzleRevisionId(sampleDailyPuzzlePrivate.id, 2)
    )
    expect(revision.id).not.toBe(sampleDailyPuzzlePrivate.id)
    expect(buildPuzzleContentVersion(revision, 2)).toBe(
      'daily-2026-06-17-v2'
    )
    expect(revision.initialRevealedMatches).toEqual([])
  })

  it('rejects invalid revision numbers', () => {
    expect(() => buildPuzzleRevisionId(sampleDailyPuzzlePrivate.id, 0)).toThrow(
      /positive integer/
    )
    expect(() => materializePuzzleRevision(sampleDailyPuzzlePrivate, 1.5)).toThrow(
      /positive integer/
    )
  })

  it('validates the full domain before creating trusted publication metadata', () => {
    const invalidPuzzle = {
      ...sampleDailyPuzzlePrivate,
      solutionCount: 999
    }

    expect(() =>
      preparePuzzleForPublication(invalidPuzzle, 'daily-2026-06-17-v1')
    ).toThrow(/SOLUTION_COUNT_MISMATCH/)
  })

  it('returns a versioned automated content QA report with publication metadata', () => {
    const publication = preparePuzzleForPublication(
      sampleDailyPuzzlePrivate,
      'daily-2026-06-17-v1'
    )

    expect(publication.metadata.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(publication.qualityReport).toMatchObject({
      version: 'scorelogic-content-qa-v1',
      success: true,
      issues: []
    })
  })

  it('rejects unsafe or empty content version identifiers', () => {
    expect(() =>
      preparePuzzleForPublication(sampleDailyPuzzlePrivate, 'Daily Version 1')
    ).toThrow(/contentVersion/)

    expect(() =>
      preparePuzzleForPublication(
        sampleDailyPuzzlePrivate,
        'daily-2026-06-18-v1'
      )
    ).toThrow(/identity prefix/)
  })
})
