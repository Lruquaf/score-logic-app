import { CampaignProgress } from '@/components/game/CampaignProgress'

export const revalidate = 300

export default function CampaignPage() {
  return (
    <main className="flex flex-1 flex-col gap-3 pb-6 pt-2 sm:gap-5 sm:pb-8 sm:pt-3">
      <section className="border-b border-[var(--line)] pb-3 sm:pb-4">
        <p className="label text-[var(--field-deep)]">Campaign</p>
        <h1 className="display-title mt-2 max-w-3xl text-[clamp(1.65rem,9vw,2.85rem)] text-[var(--ink)] sm:mt-3">
          Five packs, thirty levels each.
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-5 text-[var(--ink-soft)] sm:mt-2 sm:leading-6">
          Start with match results, move into scorelines, and track clean solves, hint solves, and answer-revealed levels.
        </p>
      </section>

      <CampaignProgress />
    </main>
  )
}
