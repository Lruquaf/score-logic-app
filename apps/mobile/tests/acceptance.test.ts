import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptanceBlockers, emptyAcceptance, percentile } from '../scripts/lib/acceptance.ts'
import { checkContrast, contrastRatio } from '../scripts/lib/contrast.ts'
test('normal text, active control and focus colors satisfy their source contrast budgets', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21)
  for (const pair of checkContrast()) assert.ok(pair.ratio >= pair.minimum, `${pair.name} has ratio ${pair.ratio}`)
})
test('an empty acceptance record never marks untested native work ready for release', () => {
  const blockers = acceptanceBlockers(emptyAcceptance())
  for (const os of ['ios', 'android']) {
    assert.ok(blockers.some(item => item.startsWith(`${os}:T18`)))
    assert.ok(blockers.some(item => item.startsWith(`${os}: physical release performance`)))
  }
  assert.ok(blockers.some(item => item.startsWith('server:T20')))
})
test('simulator evidence and a debug build cannot close physical-device or performance acceptance', () => {
  const report = emptyAcceptance()
  report.devices.push({ key: 'sim', platform: 'android', model: 'Synthetic test fixture', os: '17', kind: 'simulator', form: 'phone', compact: false, minimumOs: false, currentOs: true, midrangeOrLower: false })
  report.builds.push({ platform: 'android', artifactSha256: 'a'.repeat(64), mode: 'debug', signatureVerified: false, evidence: ['fixture'] })
  const check = report.checks.find(check => check.id === 'T18' && check.platform === 'android')!
  Object.assign(check, { status: 'passed', reviewer: 'fixture-only', evidence: ['fixture'], deviceKeys: ['sim'], coverage: ['screen-reader'] })
  const blockers = acceptanceBlockers(report)
  assert.ok(blockers.some(item => item.includes('android:T18: matching physical')))
  assert.ok(blockers.some(item => item.includes('android:T18: font-200')))
  assert.ok(blockers.some(item => item.includes('android: one verified release artifact')))
})
test('percentile budgets use raw nearest-rank samples and reject a critical issue without closure evidence', () => {
  assert.equal(percentile([100, 1, 2, 3], 0.75), 3)
  const report = emptyAcceptance()
  report.issues.push({ id: 'critical-fixture', severity: 'P1', status: 'closed', evidence: [] })
  assert.ok(acceptanceBlockers(report).some(item => item.startsWith('critical-fixture:')))
})

test('complete synthetic metadata is reviewable but a mismatched artifact or exceeded raw-sample budget reopens the gate', () => {
  const report = emptyAcceptance(); report.sourceRevision = 'synthetic-fixture'; report.backendRevision = 'synthetic-fixture'
  for (const os of ['ios', 'android'] as const) {
    report.builds.push({ platform: os, artifactSha256: 'a'.repeat(64), mode: 'release', signatureVerified: true, evidence: ['synthetic-signature-proof'] })
    for (const form of ['phone', 'tablet', 'foldable'] as const) report.devices.push({ key: `${os}-${form}`, platform: os, model: 'Synthetic fixture only', os: 'test-version', kind: 'physical', form, compact: true, minimumOs: true, currentOs: true, midrangeOrLower: true })
    for (const check of report.checks.filter(check => check.platform === os)) Object.assign(check, { status: 'passed', deviceKeys: [`${os}-phone`, `${os}-tablet`, `${os}-foldable`], evidence: ['synthetic-proof'], reviewer: 'fixture-only', coverage: ['screen-reader', 'font-200', 'reduce-motion', 'keyboard', 'contrast', 'modal-focus'] })
    report.performance.push({ platform: os, deviceKey: `${os}-phone`, artifactSha256: 'a'.repeat(64), tool: 'synthetic-test-only', reviewer: 'fixture-only', evidence: ['synthetic-trace'], coldStartMs: Array(20).fill(2000), inputLatencyMs: Array(30).fill(50), localSaveMs: Array(30).fill(100), scroll: 'passed', memoryPeakMb: 123, memoryReview: 'passed', energyReview: 'passed' })
  }
  Object.assign(report.checks.find(check => check.id === 'T20')!, { status: 'passed', reviewer: 'fixture-only', evidence: ['synthetic-server-proof'] })
  assert.deepEqual(acceptanceBlockers(report), [])
  report.performance[0].artifactSha256 = 'b'.repeat(64)
  report.performance[0].inputLatencyMs.fill(300)
  const blockers = acceptanceBlockers(report)
  assert.ok(blockers.some(item => item.includes('performance must match')))
  assert.ok(blockers.some(item => item.includes('inputLatencyMs: budget exceeded')))
})
