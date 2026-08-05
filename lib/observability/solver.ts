import type {
  SolverProfile,
  SolverResult
} from '@/lib/engine/solver'
import { captureServerEvent } from '@/lib/observability/server'

interface SolverTelemetryContext {
  profile: SolverProfile
  operation: string
}

export function buildSolverTelemetryPayload(
  result: SolverResult,
  context: SolverTelemetryContext
) {
  return {
    profile: context.profile,
    operation: context.operation,
    status: result.status,
    terminationReason: result.terminationReason,
    exhaustive: result.exhaustive,
    capped: result.capped,
    solutionsFound: result.solutions.length,
    durationMs: Math.round(result.metrics.durationMs),
    nodesVisited: result.metrics.nodesVisited,
    candidatesEvaluated: result.metrics.candidatesEvaluated,
    prunedBranches: result.metrics.prunedBranches,
    maxDepth: result.metrics.maxDepth,
    fixedCellCount: result.metrics.fixedCellCount
  }
}

export function captureSolverRun(
  result: SolverResult,
  context: SolverTelemetryContext
) {
  captureServerEvent(
    'solver_run',
    buildSolverTelemetryPayload(result, context)
  )
}
