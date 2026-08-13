import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDirectory = join(process.cwd(), 'prisma', 'migrations')
const waveSevenMigration = '20260730230000_wave_7_puzzle_domain_validation'

function readMigration(name: string) {
  return readFileSync(join(migrationsDirectory, name, 'migration.sql'), 'utf8')
}

describe('puzzle backfill migrations', () => {
  it('suspends and restores legacy NOT VALID JSON checks around every post-Wave 7 puzzle update', () => {
    const puzzleBackfills = readdirSync(migrationsDirectory)
      .filter((name) => name > waveSevenMigration)
      .map((name) => ({ name, sql: readMigration(name) }))
      .filter(({ sql }) => sql.includes('UPDATE "puzzles"'))

    expect(puzzleBackfills.map(({ name }) => name)).toEqual([
      '20260731090000_wave_8_content_versioning',
      '20260731130000_wave_11_mode_aware_difficulty',
      '20260803140000_wave_14_editorial_workflow',
      '20260804110000_wave_21_public_projection_pagination'
    ])

    for (const { name, sql } of puzzleBackfills) {
      const firstUpdate = sql.indexOf('UPDATE "puzzles"')
      const lastUpdate = sql.lastIndexOf('UPDATE "puzzles"')
      const constraintDrop = sql.search(
        /DROP CONSTRAINT(?: IF EXISTS)? "puzzles_json_shapes"/
      )
      const constraintRestore = sql.lastIndexOf(
        'ADD CONSTRAINT "puzzles_json_shapes"'
      )

      expect(constraintDrop, `${name} must drop the legacy JSON check before its backfill`).toBeGreaterThanOrEqual(0)
      expect(constraintDrop, `${name} must drop the legacy JSON check before its backfill`).toBeLessThan(firstUpdate)
      expect(constraintRestore, `${name} must restore the legacy JSON check after its backfill`).toBeGreaterThan(lastUpdate)
      expect(
        sql.slice(constraintRestore),
        `${name} must keep the restored legacy JSON check NOT VALID`
      ).toMatch(/ADD CONSTRAINT "puzzles_json_shapes"[\s\S]*?NOT VALID/)
    }
  })

  it.each([
    '20260803140000_wave_14_editorial_workflow',
    '20260804110000_wave_21_public_projection_pagination'
  ])('wraps the retry-safe %s migration in a transaction', (name) => {
    const sql = readMigration(name).trim()

    expect(sql).toMatch(/^--[\s\S]*?\nBEGIN;/)
    expect(sql).toMatch(/COMMIT;$/)
  })
})
