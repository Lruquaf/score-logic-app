import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { DeleteAccountForm } from '@/components/account/DeleteAccountForm'
import { removeDeletedOwnerDrafts, requestAccountDeletion } from '@/components/account/deletion'

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear: vi.fn() }) }))

const meta = { apiVersion: '1', serverTime: '2026-11-13T11:00:00.000Z', businessDate: '2026-11-13', timeZone: 'Europe/Istanbul', nextDailyAt: '2026-11-13T21:00:00.000Z' }

it('shows password reauthentication only for account owners and explicit confirmation for guests', () => {
  const account = renderToStaticMarkup(createElement(DeleteAccountForm, { identity: 'account', ownerKey: 'account:a' }))
  const guest = renderToStaticMarkup(createElement(DeleteAccountForm, { identity: 'guest', ownerKey: 'guest' }))
  expect(account).toContain('Current password')
  expect(guest).not.toContain('type="password"')
  expect(guest).toContain('Delete guest data permanently')
  expect(guest).toContain('type="checkbox"')
  expect(renderToStaticMarkup(createElement(DeleteAccountForm, { identity: 'none', ownerKey: null }))).toContain('browser where you played')
})

it('does not issue deletion until explicit confirmation and account password exist', async () => {
  const fetcher = vi.fn()
  await expect(requestAccountDeletion({ identity: 'account', password: '', confirmed: true }, fetcher)).rejects.toThrow('password')
  await expect(requestAccountDeletion({ identity: 'guest', password: '', confirmed: false }, fetcher)).rejects.toThrow('Confirm')
  expect(fetcher).not.toHaveBeenCalled()
})

it('posts same-origin JSON using the current cookie principal, never an arbitrary owner id', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { deleted: true }, meta })))
  await requestAccountDeletion({ identity: 'guest', password: 'ignored', confirmed: true }, fetcher)
  expect(fetcher).toHaveBeenCalledWith('/api/v1/account/delete', expect.objectContaining({ method: 'POST', credentials: 'same-origin', body: JSON.stringify({ confirmation: 'DELETE' }) }))
})

it('does not show success for malformed responses or rejected reauthentication', async () => {
  await expect(requestAccountDeletion({ identity: 'account', password: 'wrong', confirmed: true }, vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Enter your current password.' } }), { status: 401 })))).rejects.toThrow('current password')
  await expect(requestAccountDeletion({ identity: 'guest', password: '', confirmed: true }, vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { deleted: false }, meta }))))).rejects.toThrow('could not confirm')
})

it('removes deleted owner drafts while preserving unrelated account data', () => {
  const storage = { getItem: vi.fn().mockReturnValue(JSON.stringify({ version: 1, state: { draftsByOwner: { 'account:a': { private: true }, 'account:b': { keep: true } }, unclaimedDrafts: { legacy: true } } })), setItem: vi.fn() }
  removeDeletedOwnerDrafts(storage, 'account:a')
  const saved = JSON.parse(storage.setItem.mock.calls[0][1])
  expect(saved.state.draftsByOwner).toEqual({ 'account:b': { keep: true } })
  expect(saved.state.unclaimedDrafts).toEqual({})
})
