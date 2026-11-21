import { readFileSync, writeFileSync } from 'node:fs'
import { acceptanceBlockers, emptyAcceptance } from './lib/acceptance.ts'
const [command, path] = process.argv.slice(2)
if (!path || !['init', 'check'].includes(command)) throw new Error('Usage: acceptance.ts init|check <private-report.json>')
if (command === 'init') { writeFileSync(path, JSON.stringify(emptyAcceptance(), null, 2) + '\n', { flag: 'wx' }); console.log('Created pending acceptance record. No device test is marked passed.') }
else {
  const blockers = acceptanceBlockers(JSON.parse(readFileSync(path, 'utf8')))
  console.log(`Release acceptance: ${blockers.length ? 'BLOCKED' : 'REVIEWABLE'} (${blockers.length} blockers)`)
  for (const blocker of blockers) console.log(`- ${blocker}`)
  if (blockers.length) process.exitCode = 1
  else console.log('Metadata/budgets complete; reviewers must still verify signatures and evidence authenticity.')
}
