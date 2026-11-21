import { deleteAccountRequestSchema, deleteAccountResponseSchema } from '@/packages/contracts/src'

export type DeletionIdentity = 'account' | 'guest' | 'none'

export async function requestAccountDeletion(input: {
  identity: DeletionIdentity
  password: string
  confirmed: boolean
}, fetcher: typeof fetch = fetch) {
  if (input.identity === 'none') throw new Error('Sign in or return using the browser where you played as a guest.')
  if (!input.confirmed) throw new Error('Confirm that you want to delete your data.')
  if (input.identity === 'account' && !input.password) throw new Error('Enter your current password.')
  const payload = deleteAccountRequestSchema.parse({
    confirmation: 'DELETE', ...(input.identity === 'account' ? { password: input.password } : {})
  })
  const response = await fetcher('/api/v1/account/delete', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body &&
      body.error && typeof body.error === 'object' && 'message' in body.error && typeof body.error.message === 'string'
      ? body.error.message : 'We could not confirm deletion. Check your connection and try again.'
    throw new Error(message)
  }
  if (!deleteAccountResponseSchema.safeParse(body).success) {
    throw new Error('We could not confirm deletion. Refresh this page before trying again.')
  }
}

// Delete only the current owner's persisted boards; another account's local
// drafts are not part of this deletion. Full navigation clears in-memory state.
export function removeDeletedOwnerDrafts(storage: Pick<Storage, 'getItem' | 'setItem'>, ownerKey: string) {
  const raw = storage.getItem('scorelogic-puzzle-store')
  if (!raw) return
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('state' in value) || !value.state || typeof value.state !== 'object') return
  const state = value.state as { draftsByOwner?: Record<string, unknown>; drafts?: unknown; unclaimedDrafts?: unknown }
  if (state.draftsByOwner) delete state.draftsByOwner[ownerKey]
  // Legacy drafts have no trustworthy owner. Removing these prevents deleted
  // history from being recovered into a new guest identity on this device.
  delete state.drafts
  state.unclaimedDrafts = {}
  storage.setItem('scorelogic-puzzle-store', JSON.stringify(value))
}
