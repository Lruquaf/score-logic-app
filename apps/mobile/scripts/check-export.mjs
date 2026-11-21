import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const folder = resolve(process.argv[2] ?? 'dist')
const canary = 'SCORELOGIC_SERVER_ONLY_CANARY_'
const metadata = JSON.parse(readFileSync(resolve(folder, 'metadata.json'), 'utf8'))
for (const platform of ['ios', 'android']) {
  const bundlePath = resolve(folder, metadata.fileMetadata[platform].bundle)
  assert.ok(bundlePath.startsWith(folder + '/'), 'Bundle must stay inside the export folder.')
  const map = JSON.parse(readFileSync(bundlePath + '.map', 'utf8')), debugId = map.debug_id ?? map.debugId
  assert.match(debugId, /^[0-9a-f-]{36}$/i)
  const bytecode = readFileSync(bundlePath)
  assert.ok(bytecode.length <= 5_000_000, 'Hermes bytecode exceeded the 5 MB source-export regression budget.')
  assert.ok(!bytecode.includes(canary) && !JSON.stringify(map.sourcesContent).includes(canary), 'A server-only canary entered the native artifact.')
  assert.ok(bytecode.includes(debugId), 'Hermes bundle must contain the matching source-map Debug ID.')
  assert.ok(map.sources?.length > 0 && map.mappings?.length > 0, 'Nonempty symbolication coordinates are required.')
  assert.ok(!map.sources.some(source => /(?:^|\/)lib\/(?:engine|db|auth)\/|(?:^|\/)prisma\/|(?:^|\/)node_modules\/@prisma\//.test(source)), 'Private solver/database source cannot enter a mobile export.')
  assert.ok(!map.sources.some(source => /(?:^|\/)src\/design\//.test(source)), 'Web design fixtures cannot enter a native export.')
  console.log(JSON.stringify({ platform, debugId, mapMatchesBundle: true, privateEngineAbsent: true, serverCanaryAbsent: true, hermesBytes: bytecode.length, nativeBinarySizeMeasured: false }))
}
