import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'

import { reconcileUserAggregates } from '../lib/db/queries/stats'

loadEnvConfig(process.cwd())

interface ReconcileOptions {
  repair: boolean
  failOnDrift: boolean
  userId: string | null
  batchSize: number
}

function readValue(args: string[], index: number, name: string) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`)
  }
  return value
}

function parseOptions(args: string[]): ReconcileOptions {
  const options: ReconcileOptions = {
    repair: false,
    failOnDrift: false,
    userId: null,
    batchSize: 100
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    if (argument === '--') {
      continue
    }
    if (argument === '--repair') {
      options.repair = true
      continue
    }
    if (argument === '--fail-on-drift') {
      options.failOnDrift = true
      continue
    }
    if (argument === '--user') {
      options.userId = readValue(args, index, '--user')
      index += 1
      continue
    }
    if (argument === '--batch-size') {
      const value = Number(readValue(args, index, '--batch-size'))
      if (!Number.isInteger(value) || value < 1 || value > 1000) {
        throw new Error('--batch-size must be an integer between 1 and 1000.')
      }
      options.batchSize = value
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }

  return options
}

async function* listUserIds(
  prisma: PrismaClient,
  options: Pick<ReconcileOptions, 'userId' | 'batchSize'>
) {
  if (options.userId) {
    const user = await prisma.user.findUnique({
      where: { id: options.userId },
      select: { id: true }
    })
    if (!user) {
      throw new Error(`User ${options.userId} was not found.`)
    }
    yield user.id
    return
  }

  let cursor: string | undefined
  while (true) {
    const users = await prisma.user.findMany({
      take: options.batchSize,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1
          }
        : {}),
      orderBy: { id: 'asc' },
      select: { id: true }
    })
    if (users.length === 0) return

    for (const user of users) {
      yield user.id
    }
    cursor = users.at(-1)!.id
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const prisma = new PrismaClient()
  let checked = 0
  let drifted = 0
  let repaired = 0

  try {
    for await (const userId of listUserIds(prisma, options)) {
      const result = await reconcileUserAggregates(
        {
          userId,
          repair: options.repair
        },
        prisma
      )
      checked += 1
      if (result.drifted) {
        drifted += 1
        if (result.repaired) repaired += 1
        console.log(JSON.stringify({
          userId,
          repaired: result.repaired,
          differences: result.differences
        }))
      }
    }

    console.log(JSON.stringify({
      mode: options.repair ? 'repair' : 'dry-run',
      checked,
      drifted,
      repaired
    }))

    if (options.failOnDrift && drifted > 0 && !options.repair) {
      process.exitCode = 2
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('Stats reconciliation failed:', error)
  process.exitCode = 1
})
