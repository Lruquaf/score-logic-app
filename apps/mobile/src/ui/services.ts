import type { PuzzleController } from '../core/controller'
import type { SessionClient } from '../core/session'
import type { LifecycleCoordinator, MobileRuntime } from '../core/runtime'
export interface Services {
  controller: PuzzleController
  client: SessionClient
  runtime: MobileRuntime
  lifecycle: LifecycleCoordinator
  config: { apiOrigin: string; webOrigin: string; scheme: string; supportUrl?: string; crashReporting?: boolean; buildId?: string }
}
