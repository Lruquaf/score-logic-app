import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import { auth } from '@/auth'
import { DeleteAccountForm } from '@/components/account/DeleteAccountForm'
import { ANON_COOKIE } from '@/lib/auth/anonymous'

export const metadata: Metadata = { title: 'Delete account and data' }

export default async function DeleteAccountPage() {
  const session = await auth()
  const guestCookie = (await cookies()).get(ANON_COOKIE)?.value
  const accountId = session?.user?.id
  const identity = accountId ? 'account' : guestCookie ? 'guest' : 'none'
  return <main className="page-container max-w-2xl pb-12 pt-8">
    <p className="inline-flex min-h-12 items-center font-bold text-[var(--field-deep)]">ScoreLogic</p>
    <h1 className="mt-5 font-[var(--font-display)] text-3xl font-semibold">Delete your account and game data</h1>
    <p className="mt-4 leading-7">You can request deletion here on the web, or from Account in the mobile app. Signing out or uninstalling alone does not delete server data.</p>
    <DeleteAccountForm identity={identity} ownerKey={accountId ? `account:${accountId}` : guestCookie ? 'guest' : null} />
    <section className="mt-8 space-y-3 leading-7 text-[var(--ink-soft)]">
      <h2 className="text-xl font-semibold text-[var(--ink)]">What deletion covers</h2>
      <p>Deletion removes the identified account or guest profile and its associated game attempts, progress, completions, notes and session credentials from the active service. Shared puzzle content remains available to other players. Copies of invitations already shared in other apps are outside ScoreLogic&apos;s control.</p>
      <h2 className="pt-3 text-xl font-semibold text-[var(--ink)]">Backups and operational records</h2>
      <p>Encrypted backups and minimized security or diagnostic records may remain under operational retention policies. Deletion from the active service does not promise immediate erasure of every backup copy. A backup restore must reapply completed deletion requests before affected data is served again.</p>
      <p>If you have lost access to an account, do not create a new guest profile to delete it: a new profile cannot prove ownership of the old data. Use the original account credentials or the original browser/app guest session.</p>
    </section>
  </main>
}
