import { checkContrast } from './lib/contrast.ts'
const results = checkContrast()
for (const result of results) console.log(`${result.ratio >= result.minimum ? 'PASS' : 'FAIL'} ${result.name}: ${result.ratio.toFixed(2)}:1 (minimum ${result.minimum})`)
if (results.some(result => result.ratio < result.minimum)) process.exitCode = 1
console.log('Source color pairs only; native screen-reader, layout and rendered contrast acceptance remain separate.')
