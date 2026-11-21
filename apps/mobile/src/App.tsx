import React, { useEffect, useState } from 'react'
import { Platform, StatusBar } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { CONTRACTS_VERSION, nativeSessionDataSchema } from '@scorelogic/contracts'
import app from '../package.json'
import { clientIdentity, withClientHeader } from './core/http'
import { initDiagnostics } from './diagnostics'
import { CrashBoundary } from './ui/CrashBoundary'
import { mobileConfig } from './config'
import { environmentNamespace, openDraftStore, randomSource, secureVault } from './storage'
import { SessionClient } from './core/session'
import { PuzzleController } from './core/controller'
import { LifecycleCoordinator, MobileRuntime, failureKind } from './core/runtime'
import { AppShell } from './ui/AppShell'
import { StatusView } from './ui/StatusView'
import { styles } from './ui/primitives'
import type { Services } from './ui/services'

// One bootstrap per JS process also prevents StrictMode/fast remounts from racing
// two installation-secret creations or opening duplicate database connections.
let bootPromise: Promise<Services> | null = null
function openServices(): Promise<Services> {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    const config = mobileConfig()
    initDiagnostics()
    const namespace = environmentNamespace(config.apiOrigin)
    const store = await openDraftStore(namespace)
    const identity = clientIdentity(Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web', app.version, CONTRACTS_VERSION)
    const client = new SessionClient(config.apiOrigin, secureVault(namespace), randomSource, nativeSessionDataSchema, withClientHeader((input, init) => fetch(input, init), identity))
    const controller = new PuzzleController(client, store, randomSource)
    const runtime = new MobileRuntime(client, store, controller)
    const lifecycle = new LifecycleCoordinator(controller)
    await runtime.start()
    return { controller, client, runtime, lifecycle, config }
  })().catch(error => { bootPromise = null; throw error })
  return bootPromise
}
export default function App() {
  const [services, setServices] = useState<Services | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    void openServices().then(value => { if (active) setServices(value) }).catch(reason => { if (active) setError(reason) })
    return () => { active = false }
  }, [attempt])
  return <SafeAreaProvider><StatusBar barStyle="dark-content" /><SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safe}>
    {services ? <CrashBoundary><AppShell services={services} /></CrashBoundary> : <StatusView issue={error ? failureKind(error) : null} message={error instanceof Error ? error.message : null} pending={!error} retry={() => { setError(null); setAttempt(value => value + 1) }} />}
  </SafeAreaView></SafeAreaProvider>
}
