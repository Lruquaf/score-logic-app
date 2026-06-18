import type { ConstraintViolation } from '@/lib/engine/types'

interface ConstraintPanelProps {
  violations: ConstraintViolation[]
  completedMatches: number
  totalMatches: number
  attempts: number
  hintTypes: string[]
}

export function ConstraintPanel({
  violations,
  completedMatches,
  totalMatches,
  attempts,
  hintTypes
}: ConstraintPanelProps) {
  return (
    <aside className="panel overflow-hidden">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Checks</h2>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper-soft)] p-3">
            <div className="text-xs font-semibold uppercase text-[var(--muted)]">Locked</div>
            <div className="mt-1 font-mono text-xl font-semibold text-[var(--ink)]">
              {completedMatches}/{totalMatches}
            </div>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper-soft)] p-3">
            <div className="text-xs font-semibold uppercase text-[var(--muted)]">Tries</div>
            <div className="mt-1 font-mono text-xl font-semibold text-[var(--ink)]">{attempts}</div>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper-soft)] p-3">
            <div className="text-xs font-semibold uppercase text-[var(--muted)]">Errors</div>
            <div className="mt-1 font-mono text-xl font-semibold text-[var(--ink)]">{violations.length}</div>
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-[var(--ink)]">Status</div>
            {hintTypes.length > 0 ? (
              <div className="text-xs text-[var(--muted)]">Hints: {hintTypes.length}</div>
            ) : null}
          </div>

          {violations.length === 0 ? (
            <div
              className="rounded-[var(--radius-lg)] border border-[var(--success)]/25 bg-[var(--success-soft)] px-3 py-3 text-sm font-semibold text-[var(--field-deep)]"
              aria-live="polite"
            >
              Looks valid so far.
            </div>
          ) : (
            <ul className="space-y-2" aria-live="assertive">
              {violations.slice(0, 4).map((violation, index) => (
                <li
                  key={`${violation.teamId}-${violation.type}-${index}`}
                  className="rounded-[var(--radius-lg)] border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3 py-3 text-sm font-semibold text-[var(--danger)]"
                  role="alert"
                  data-testid="constraint-error"
                >
                  <span className="font-semibold">{violation.teamId}</span> {violation.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  )
}
