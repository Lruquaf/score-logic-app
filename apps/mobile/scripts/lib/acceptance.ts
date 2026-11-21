import { z } from 'zod'
export const scenarioIds = Array.from({ length: 20 }, (_, index) => `T${String(index + 1).padStart(2, '0')}`)
const platform = z.enum(['ios', 'android']), status = z.enum(['pending', 'passed', 'failed'])
const refs = z.array(z.string().trim().min(1))
export const acceptanceSchema = z.object({
  schemaVersion: z.literal(1), sourceRevision: z.string(), backendRevision: z.string(),
  builds: z.array(z.object({ platform, artifactSha256: z.string().regex(/^[0-9a-f]{64}$/i), mode: z.enum(['debug', 'release']), signatureVerified: z.boolean(), evidence: refs })),
  devices: z.array(z.object({ key: z.string().min(1), platform, model: z.string().min(1), os: z.string().min(1), kind: z.enum(['physical', 'simulator']), form: z.enum(['phone', 'tablet', 'foldable']), compact: z.boolean(), minimumOs: z.boolean(), currentOs: z.boolean(), midrangeOrLower: z.boolean() })),
  checks: z.array(z.object({ id: z.string(), platform: z.enum(['ios', 'android', 'server']), status, deviceKeys: refs, evidence: refs, reviewer: z.string().nullable(), coverage: z.array(z.string()) })),
  performance: z.array(z.object({ platform, deviceKey: z.string(), artifactSha256: z.string(), tool: z.string().min(1), evidence: refs, reviewer: z.string().min(1), coldStartMs: z.array(z.number().finite().positive()), inputLatencyMs: z.array(z.number().finite().nonnegative()), localSaveMs: z.array(z.number().finite().nonnegative()), scroll: status, memoryPeakMb: z.number().finite().positive().nullable(), memoryReview: status, energyReview: status })),
  issues: z.array(z.object({ id: z.string(), severity: z.enum(['P0', 'P1', 'P2', 'P3']), status: z.enum(['open', 'closed']), evidence: refs }))
}).strict()
export type Acceptance = z.infer<typeof acceptanceSchema>
export function emptyAcceptance(): Acceptance {
  return { schemaVersion: 1, sourceRevision: '', backendRevision: '', builds: [], devices: [], performance: [], issues: [], checks: scenarioIds.flatMap(id => (id === 'T20' ? ['server' as const] : ['ios' as const, 'android' as const]).map(platform => ({ id, platform, status: 'pending' as const, deviceKeys: [], evidence: [], reviewer: null, coverage: [] }))) }
}
export function percentile(samples: number[], fraction: number) { if (!samples.length) return null; return [...samples].sort((a, b) => a - b)[Math.max(0, Math.ceil(samples.length * fraction) - 1)] }
/** Completeness/budget validator, not a cryptographic attestation or substitute for reviewing artifacts. */
export function acceptanceBlockers(raw: unknown): string[] {
  const report = acceptanceSchema.parse(raw), blockers: string[] = []
  if (!report.sourceRevision.trim() || !report.backendRevision.trim()) blockers.push('Record tested source and backend revisions.')
  const checkKeys = report.checks.map(item => `${item.platform}:${item.id}`)
  if (new Set(checkKeys).size !== checkKeys.length) blockers.push('Duplicate scenario records.')
  if (new Set(report.devices.map(item => item.key)).size !== report.devices.length) blockers.push('Duplicate device keys.')
  for (const expected of emptyAcceptance().checks) {
    const check = report.checks.find(item => item.id === expected.id && item.platform === expected.platform)
    const label = `${expected.platform}:${expected.id}`
    if (!check || check.status !== 'passed' || !check.evidence.length || !check.reviewer?.trim()) { blockers.push(`${label}: reviewed passing evidence missing.`); continue }
    if (check.platform !== 'server' && check.id !== 'T17' && !check.deviceKeys.some(key => report.devices.some(device => device.key === key && device.platform === check.platform && device.kind === 'physical'))) blockers.push(`${label}: matching physical device missing.`)
    if (check.id === 'T18') for (const capability of ['screen-reader', 'font-200', 'reduce-motion', 'keyboard', 'contrast', 'modal-focus']) if (!check.coverage.includes(capability)) blockers.push(`${label}: ${capability} evidence missing.`)
  }
  if (report.checks.some(check => !scenarioIds.includes(check.id) || check.id === 'T20' && check.platform !== 'server' || check.id !== 'T20' && check.platform === 'server')) blockers.push('Unexpected scenario/platform record.')
  for (const os of ['ios', 'android'] as const) {
    const builds = report.builds.filter(build => build.platform === os)
    if (builds.length !== 1 || builds[0]?.mode !== 'release' || !builds[0].signatureVerified || !builds[0].evidence.length) blockers.push(`${os}: one verified release artifact is required.`)
    const usedKeys = new Set(report.checks.filter(check => check.platform === os && check.status === 'passed').flatMap(check => check.deviceKeys))
    const devices = report.devices.filter(device => device.platform === os && device.kind === 'physical' && usedKeys.has(device.key))
    if (!devices.some(device => device.form === 'phone') || !devices.some(device => device.form === 'tablet') || !devices.some(device => device.minimumOs) || !devices.some(device => device.currentOs)) blockers.push(`${os}: phone/tablet and minimum/current OS matrix incomplete.`)
    if (os === 'ios' && !devices.some(device => device.form === 'phone' && device.compact)) blockers.push('ios: compact phone evidence missing.')
    if (os === 'android' && (!devices.some(device => device.form === 'foldable') || !devices.some(device => device.form === 'phone' && device.midrangeOrLower))) blockers.push('android: foldable and low/midrange phone evidence missing.')
    const perf = report.performance.filter(item => item.platform === os)
    if (!perf.length) blockers.push(`${os}: physical release performance baseline missing.`)
    for (const measurement of perf) {
      const device = devices.find(item => item.key === measurement.deviceKey)
      if (!device || !builds.some(build => build.mode === 'release' && build.artifactSha256 === measurement.artifactSha256)) blockers.push(`${os}: performance must match the tested physical device and release artifact.`)
      if (!measurement.evidence.length) blockers.push(`${os}: profiler evidence missing.`)
      for (const [metric, minimum, quantile, budget] of [['coldStartMs', 20, 0.75, 3000], ['inputLatencyMs', 30, 0.95, 100], ['localSaveMs', 30, 0.95, 200]] as const) {
        if (measurement[metric].length < minimum) blockers.push(`${os}:${metric}: insufficient samples (${minimum} required).`)
        else if (percentile(measurement[metric], quantile)! > budget) blockers.push(`${os}:${metric}: budget exceeded (${budget}ms).`)
      }
      if (measurement.scroll !== 'passed' || measurement.memoryReview !== 'passed' || measurement.energyReview !== 'passed' || measurement.memoryPeakMb === null) blockers.push(`${os}: scroll/memory/energy profiler review incomplete.`)
    }
  }
  for (const issue of report.issues) if (['P0', 'P1'].includes(issue.severity) && (issue.status !== 'closed' || !issue.evidence.length)) blockers.push(`${issue.id}: critical issue lacks verified closure.`)
  return blockers
}
