import React from 'react'
import { render, screen, userEvent } from '@testing-library/react-native'
import * as Sentry from '@sentry/react-native'
import { initDiagnostics } from '../../src/diagnostics'
import { CrashBoundary } from '../../src/ui/CrashBoundary'
jest.mock('@sentry/react-native', () => ({ init: jest.fn(), setUser: jest.fn(), captureException: jest.fn() }))
test('diagnostics is opt-in, minimizes SDK collection and filters events before sending', () => {
  const before = { enabled: process.env.EXPO_PUBLIC_CRASH_REPORTING_ENABLED, dsn: process.env.EXPO_PUBLIC_SENTRY_DSN }
  const development = __DEV__
  try {
    process.env.EXPO_PUBLIC_CRASH_REPORTING_ENABLED = 'false'; initDiagnostics()
    expect(Sentry.init).not.toHaveBeenCalled()
    process.env.EXPO_PUBLIC_CRASH_REPORTING_ENABLED = 'true'; process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@sentry.example.com/1'; initDiagnostics()
    expect(Sentry.init).not.toHaveBeenCalled()
    Reflect.set(globalThis, '__DEV__', false)
    initDiagnostics()
    const options = jest.mocked(Sentry.init).mock.calls[0][0]!
    expect(options.sendDefaultPii).toBe(false); expect(options.maxBreadcrumbs).toBe(0)
    expect(options.attachScreenshot).toBe(false); expect(options.attachViewHierarchy).toBe(false)
    expect(options.enableAutoSessionTracking).toBe(false); expect(options.enableLogs).toBe(false)
    const hint = { attachments: [{ filename: 'private.txt', data: 'private note' }] }
    const event = options.beforeSend!({ type: undefined, message: 'private note', request: { data: 'private note' } }, hint)
    expect(JSON.stringify(event)).not.toContain('private note'); expect(hint.attachments).toEqual([])
  } finally {
    Reflect.set(globalThis, '__DEV__', development)
    for (const [key, value] of Object.entries({ EXPO_PUBLIC_CRASH_REPORTING_ENABLED: before.enabled, EXPO_PUBLIC_SENTRY_DSN: before.dsn })) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
})
test('render crash shows a recovery surface and retry restores children without clearing saved data', async () => {
  let fail = true
  function Child() { if (fail) throw new Error('private render detail'); return <></> }
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    await render(<CrashBoundary><Child /></CrashBoundary>)
    expect(screen.getByText('ScoreLogic needs to reopen this screen')).toBeVisible()
    expect(screen.queryByText('private render detail')).toBeNull()
    fail = false; await userEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByText('ScoreLogic needs to reopen this screen')).toBeNull()
  } finally { log.mockRestore() }
})
