import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'

import { getDailyBufferDaysAhead } from '../lib/env/server'
import {
  fillDailyPuzzleBuffer,
  inspectDailyPuzzleBuffer,
  normalizeDailyBufferDaysAhead
} from '../lib/puzzles/dailyBuffer'
import { assertBusinessDate } from '../lib/time/businessDate'

loadEnvConfig(process.cwd())

interface WorkerOptions {
  mode: 'fill' | 'check'
  startDate?: string
  daysAhead: number
}

function parseOptions(argv: string[]): WorkerOptions {
  let mode: WorkerOptions['mode'] = 'fill'
  let startDate: string | undefined
  let daysAhead = getDailyBufferDaysAhead()

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--check') {
      mode = 'check'
    } else if (argument === '--start') {
      startDate = assertBusinessDate(argv[++index] ?? '')
    } else if (argument === '--days-ahead') {
      daysAhead = normalizeDailyBufferDaysAhead(Number(argv[++index]))
    } else {
      throw new Error(`Unknown daily buffer option "${argument}".`)
    }
  }

  return { mode, startDate, daysAhead }
}

const prisma = new PrismaClient()

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const params = {
    startDate: options.startDate,
    daysAhead: options.daysAhead
  }
  const report = options.mode === 'check'
    ? await inspectDailyPuzzleBuffer(params, prisma)
    : await fillDailyPuzzleBuffer(params, prisma)

  console.log(JSON.stringify({
    event: options.mode === 'check' ? 'daily_buffer_checked' : 'daily_buffer_filled',
    ...report
  }))

  if (
    (options.mode === 'check' && report.status !== 'READY') ||
    (options.mode === 'fill' && report.status === 'GAP')
  ) {
    process.exitCode = 2
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(JSON.stringify({
      event: 'daily_buffer_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error)
    }))
    await prisma.$disconnect()
    process.exit(1)
  })
