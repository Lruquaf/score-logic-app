import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const standaloneDir = join(root, '.next', 'standalone')
const staticSource = join(root, '.next', 'static')
const staticTarget = join(standaloneDir, '.next', 'static')
const publicSource = join(root, 'public')
const publicTarget = join(standaloneDir, 'public')

if (!existsSync(standaloneDir)) {
  throw new Error('Missing .next/standalone. Run next build with output: standalone first.')
}

if (!existsSync(staticSource)) {
  throw new Error('Missing .next/static. Static assets were not produced by next build.')
}

mkdirSync(join(standaloneDir, '.next'), { recursive: true })
rmSync(staticTarget, { recursive: true, force: true })
cpSync(staticSource, staticTarget, { recursive: true })

if (existsSync(publicSource)) {
  rmSync(publicTarget, { recursive: true, force: true })
  cpSync(publicSource, publicTarget, { recursive: true })
}

console.log('Prepared standalone static assets.')
