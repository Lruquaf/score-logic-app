import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'

import { calibrateObservedDifficulty } from '../lib/db/queries/difficultyCalibration'
import {
  DEFAULT_CALIBRATION_MINIMUM_SAMPLE_SIZE,
  DEFAULT_CALIBRATION_WINDOW_DAYS,
  DEFAULT_STALE_ATTEMPT_HOURS,
  resolveDifficultyCalibrationWindow
} from '../lib/difficulty/observed'

loadEnvConfig(process.cwd())

interface CalibrationOptions {
  now: Date
  windowDays: number
  minimumSampleSize: number
  staleAttemptHours: number
  failOnDrift: boolean
}

function readValue(args: string[], index: number, flag: string) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`)
  }
  return value
}

function readInteger(args: string[], index: number, flag: string) {
  const value = Number(readValue(args, index, flag))
  if (!Number.isInteger(value)) {
    throw new Error(`${flag} requires an integer.`)
  }
  return value
}

function parseOptions(args: string[]): CalibrationOptions {
  const options: CalibrationOptions = {
    now: new Date(),
    windowDays: DEFAULT_CALIBRATION_WINDOW_DAYS,
    minimumSampleSize: DEFAULT_CALIBRATION_MINIMUM_SAMPLE_SIZE,
    staleAttemptHours: DEFAULT_STALE_ATTEMPT_HOURS,
    failOnDrift: false
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    if (argument === '--window-days') {
      options.windowDays = readInteger(args, index, argument)
      index += 1
    } else if (argument === '--minimum-sample-size') {
      options.minimumSampleSize = readInteger(args, index, argument)
      index += 1
    } else if (argument === '--stale-attempt-hours') {
      options.staleAttemptHours = readInteger(args, index, argument)
      index += 1
    } else if (argument === '--at') {
      options.now = new Date(readValue(args, index, argument))
      if (Number.isNaN(options.now.getTime())) {
        throw new Error('--at requires a valid ISO-8601 instant.')
      }
      index += 1
    } else if (argument === '--fail-on-drift') {
      options.failOnDrift = true
    } else {
      throw new Error(`Unknown calibration option "${argument}".`)
    }
  }
  return options
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const window = resolveDifficultyCalibrationWindow({
    now: options.now,
    windowDays: options.windowDays
  })
  const prisma = new PrismaClient()

  try {
    const report = await calibrateObservedDifficulty({
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      minimumSampleSize: options.minimumSampleSize,
      staleAttemptHours: options.staleAttemptHours
    }, prisma)
    console.log(JSON.stringify({
      event: 'difficulty_calibration_completed',
      ...report
    }))
    if (options.failOnDrift && report.driftedPuzzleCount > 0) {
      process.exitCode = 2
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: 'difficulty_calibration_failed',
    errorName: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error)
  }))
  process.exit(1)
})
