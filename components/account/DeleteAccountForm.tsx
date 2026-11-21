'use client'

import { useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'

import { usePuzzleStore } from '@/store/puzzleStore'
import { useUserStore } from '@/store/userStore'

import { removeDeletedOwnerDrafts, requestAccountDeletion, type DeletionIdentity } from './deletion'

export function DeleteAccountForm({ identity, ownerKey }: { identity: DeletionIdentity; ownerKey: string | null }) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError(null)
    try {
      await requestAccountDeletion({ identity, password, confirmed })
      setPassword('')
      if (ownerKey) usePuzzleStore.getState().forgetOwner(ownerKey)
      useUserStore.getState().clearUser()
      queryClient.clear()
      try { if (ownerKey) removeDeletedOwnerDrafts(window.localStorage, ownerKey) } catch {
        // Server deletion has succeeded even if this browser blocks storage.
      }
      setDeleted(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Deletion could not be confirmed. Please try again.')
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  function returnToGame() {
    // Reload after cookie invalidation so no authenticated router/session cache
    // survives deletion. This is intentionally a full document navigation.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/')
  }

  if (deleted) return <section role="status" className="panel mt-6 p-5">
    <h2 className="text-xl font-bold">Your data has been deleted.</h2>
    <p className="mt-2">Your account or guest profile and its saved game data have been removed from the active service.</p>
    <button type="button" onClick={returnToGame} className="btn-primary mt-5 min-h-12">Return to ScoreLogic</button>
  </section>

  if (identity === 'none') return <section className="panel mt-6 p-5">
    <h2 className="text-xl font-bold">Identify the data to delete</h2>
    <p className="mt-2">Sign in to delete your account. To delete guest data, open this page in the browser where you played, or use the app that holds your guest session. This page cannot identify a guest from another device.</p>
    <Link href="/login" className="btn-primary mt-5 min-h-12">Sign in</Link>
  </section>

  return <form onSubmit={submit} aria-busy={pending} className="panel mt-6 space-y-5 p-5">
    <h2 className="text-xl font-bold">{identity === 'guest' ? 'Delete guest data' : 'Delete your account'}</h2>
    {identity === 'account' ? <div>
      <label htmlFor="deletion-password" className="block font-semibold">Current password</label>
      <input id="deletion-password" type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)}
        required maxLength={128} autoComplete="current-password" disabled={pending}
        aria-describedby={error ? 'deletion-error' : undefined}
        className="mt-2 min-h-12 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-white p-3 text-base" />
    </div> : <p>No password is needed for this browser&apos;s guest profile. Confirm below to remove it.</p>}
    <label className="flex min-h-12 items-start gap-3 py-2">
      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)}
        disabled={pending} required className="mt-1 h-5 w-5 shrink-0 accent-[var(--danger)]" />
      <span>I understand that my saved puzzle progress, notes and history will be deleted. This cannot be undone in the app.</span>
    </label>
    {error ? <p id="deletion-error" role="alert" className="text-[var(--danger)]">{error}</p> : null}
    <button type="submit" disabled={pending || !confirmed || (identity === 'account' && !password)}
      className="min-h-12 w-full rounded-[var(--radius-md)] bg-[var(--danger)] px-4 py-3 font-bold text-white disabled:opacity-50">
      {pending ? 'Deleting…' : identity === 'guest' ? 'Delete guest data permanently' : 'Delete account permanently'}
    </button>
    <Link href="/" className="btn-secondary min-h-12 w-full">Cancel</Link>
  </form>
}
