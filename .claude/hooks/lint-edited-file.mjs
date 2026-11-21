#!/usr/bin/env node
// PostToolUse: lint the file Claude just edited and feed errors back (exit 2).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
const file = input.tool_input?.file_path
const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd()
if (!file || !/\.(ts|tsx|mjs|js|jsx)$/.test(file)) process.exit(0)

const abs = path.resolve(root, file)
const rel = path.relative(root, abs)
if (rel.startsWith('..') || /(^|\/)(node_modules|\.next|\.next-dev|dist|build)\//.test(rel) || !existsSync(abs)) process.exit(0)

const eslint = path.join(root, 'node_modules', '.bin', 'eslint')
if (!existsSync(eslint)) process.exit(0)

try {
  execFileSync(eslint, ['--no-warn-ignored', '--max-warnings=0', rel], { cwd: root, stdio: 'pipe', timeout: 60000 })
} catch (error) {
  const out = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
  if (!out) process.exit(0) // timeout or crash: do not block work
  process.stderr.write(`ESLint found problems in ${rel}. Fix them:\n${out.slice(0, 4000)}\n`)
  process.exit(2)
}
