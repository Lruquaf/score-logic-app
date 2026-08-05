import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'

import {
  activateDuePuzzleRevisions,
  activatePuzzleRevision,
  cancelPuzzleRevisionActivation,
  reviewPuzzleRevision,
  schedulePuzzleRevisionActivation,
  type EditorialReviewDecision
} from '../lib/db/queries/puzzleVersions'
import { PUZZLE_CONTENT_QA_VERSION } from '../lib/puzzles/contentQuality'

loadEnvConfig(process.cwd())

interface EditorialOptions {
  contentKey: string | null
  revision: number | null
  decision: EditorialReviewDecision | null
  actor: string | null
  note: string | null
  schedule: Date | null
  activate: boolean
  cancelSchedule: boolean
  rollbackRevision: number | null
  approvePending: boolean
  activateDue: boolean
  batchSize: number
}

function parsePositiveInteger(value: string | undefined, flag: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} requires a positive integer.`)
  }
  return parsed
}

function parseInstant(value: string | undefined) {
  const instant = new Date(value ?? '')
  if (Number.isNaN(instant.getTime())) {
    throw new Error('--schedule requires a valid ISO-8601 instant.')
  }
  return instant
}

function parseOptions(argv: string[]): EditorialOptions {
  const options: EditorialOptions = {
    contentKey: null,
    revision: null,
    decision: null,
    actor: null,
    note: null,
    schedule: null,
    activate: false,
    cancelSchedule: false,
    rollbackRevision: null,
    approvePending: false,
    activateDue: false,
    batchSize: 100
  }
  let reviewDecisionSelected = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--content-key') {
      options.contentKey = argv[++index] ?? null
    } else if (argument === '--revision') {
      options.revision = parsePositiveInteger(argv[++index], '--revision')
    } else if (argument === '--approve') {
      if (reviewDecisionSelected) throw new Error('Choose only one review decision.')
      options.decision = 'APPROVED'
      reviewDecisionSelected = true
    } else if (argument === '--request-changes') {
      if (reviewDecisionSelected) throw new Error('Choose only one review decision.')
      options.decision = 'CHANGES_REQUESTED'
      reviewDecisionSelected = true
    } else if (argument === '--reject') {
      if (reviewDecisionSelected) throw new Error('Choose only one review decision.')
      options.decision = 'REJECTED'
      reviewDecisionSelected = true
    } else if (argument === '--actor') {
      options.actor = argv[++index] ?? null
    } else if (argument === '--note') {
      options.note = argv[++index] ?? null
    } else if (argument === '--schedule') {
      options.schedule = parseInstant(argv[++index])
    } else if (argument === '--activate') {
      options.activate = true
    } else if (argument === '--cancel-schedule') {
      options.cancelSchedule = true
    } else if (argument === '--rollback') {
      options.rollbackRevision = parsePositiveInteger(argv[++index], '--rollback')
    } else if (argument === '--approve-pending') {
      options.approvePending = true
    } else if (argument === '--activate-due') {
      options.activateDue = true
    } else if (argument === '--batch-size') {
      options.batchSize = parsePositiveInteger(argv[++index], '--batch-size')
    } else {
      throw new Error(`Unknown editorial option "${argument}".`)
    }
  }

  if (!options.actor) throw new Error('--actor is required for every editorial action.')
  if (options.batchSize > 500) {
    throw new Error('--batch-size must not exceed 500.')
  }
  const batchModes = Number(options.approvePending) + Number(options.activateDue)
  if (batchModes > 1) throw new Error('Choose only one editorial batch mode.')
  if (options.schedule && options.activate) {
    throw new Error('--schedule and --activate cannot be used together.')
  }
  if (options.rollbackRevision !== null) {
    options.revision = options.rollbackRevision
  }
  if (!options.approvePending && !options.activateDue) {
    if (!options.contentKey || options.revision === null) {
      throw new Error('--content-key and --revision are required.')
    }
  }
  if (
    !options.decision &&
    !options.schedule &&
    !options.activate &&
    !options.cancelSchedule &&
    options.rollbackRevision === null &&
    !options.approvePending &&
    !options.activateDue
  ) {
    throw new Error('No editorial action was selected.')
  }

  return options
}

const prisma = new PrismaClient()
const LOCAL_BOOTSTRAP_ACTOR = 'system:local-bootstrap'

async function approvePending(options: EditorialOptions) {
  if (
    process.env.NODE_ENV === 'production' ||
    options.actor !== LOCAL_BOOTSTRAP_ACTOR
  ) {
    throw new Error(
      `--approve-pending is restricted to non-production ${LOCAL_BOOTSTRAP_ACTOR} bootstrap runs.`
    )
  }
  const pending = await prisma.puzzle.findMany({
    where: {
      isTested: true,
      contentQaVersion: PUZZLE_CONTENT_QA_VERSION,
      editorialStatus: 'PENDING_REVIEW'
    },
    orderBy: [{ contentKey: 'asc' }, { contentRevision: 'asc' }],
    take: options.batchSize,
    select: { contentKey: true, contentRevision: true }
  })
  const approved = []
  const activated = []

  for (const target of pending) {
    await reviewPuzzleRevision({
      contentKey: target.contentKey,
      revision: target.contentRevision,
      decision: 'APPROVED',
      actor: options.actor!,
      note: options.note
    }, prisma)
    approved.push(target)
    if (options.activate) {
      const activation = await activatePuzzleRevision({
        contentKey: target.contentKey,
        revision: target.contentRevision,
        actor: options.actor!,
        note: options.note
      }, prisma)
      if (activation.activated) activated.push(target)
    }
  }

  return {
    event: 'editorial_pending_approved',
    selectedCount: pending.length,
    approvedCount: approved.length,
    activatedCount: activated.length,
    approved,
    activated
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.activateDue) {
    const report = await activateDuePuzzleRevisions({
      actor: options.actor!,
      batchSize: options.batchSize
    }, prisma)
    console.log(JSON.stringify({ event: 'editorial_due_activations_processed', ...report }))
    if (report.status === 'PARTIAL') process.exitCode = 2
    return
  }
  if (options.approvePending) {
    console.log(JSON.stringify(await approvePending(options)))
    return
  }

  const target = {
    contentKey: options.contentKey!,
    revision: options.revision!,
    actor: options.actor!,
    note: options.note
  }
  if (options.decision) {
    console.log(JSON.stringify({
      event: 'editorial_review_recorded',
      ...await reviewPuzzleRevision({ ...target, decision: options.decision }, prisma)
    }))
  }
  if (options.cancelSchedule) {
    console.log(JSON.stringify({
      event: 'editorial_activation_cancelled',
      ...await cancelPuzzleRevisionActivation(target, prisma)
    }))
  }
  if (options.schedule) {
    console.log(JSON.stringify({
      event: 'editorial_activation_scheduled',
      ...await schedulePuzzleRevisionActivation({
        ...target,
        scheduledFor: options.schedule
      }, prisma)
    }))
  }
  if (options.activate || options.rollbackRevision !== null) {
    console.log(JSON.stringify({
      event: options.rollbackRevision === null
        ? 'editorial_revision_activated'
        : 'editorial_revision_rolled_back',
      ...await activatePuzzleRevision({
        ...target,
        action: options.rollbackRevision === null ? 'ACTIVATED' : 'ROLLED_BACK'
      }, prisma)
    }))
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(JSON.stringify({
      event: 'editorial_workflow_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error)
    }))
    await prisma.$disconnect()
    process.exit(1)
  })
