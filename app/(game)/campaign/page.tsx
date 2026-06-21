import { CampaignProgress } from '@/components/game/CampaignProgress'

export const revalidate = 300

export default function CampaignPage() {
  return (
    <main className="flex flex-1 flex-col gap-8 pb-8 pt-4">
      <section className="border-b border-[var(--line)] pb-7">
        <p className="label text-[var(--field-deep)]">Campaign</p>
        <h1 className="display-title mt-4 max-w-3xl text-[clamp(2.25rem,5vw,3.75rem)] text-[var(--ink)]">
          Practice puzzles, from easy to hard.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--ink-soft)]">
          Choose a puzzle, solve the hidden scorelines, and build your progress across every difficulty level.
        </p>
      </section>

      <CampaignProgress />
    </main>
  )
}
