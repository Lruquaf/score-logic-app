#!/usr/bin/env node
// PreToolUse guard: blocks access to secrets and edits to applied Prisma migrations.
// Exit code 2 blocks the tool call and shows stderr to Claude.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
const tool = input.tool_name ?? ''
const args = input.tool_input ?? {}
const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd()

const SECRET_PATH = /(^|[\/\s'"=])(\.env(\.(?!example\b)[\w.-]+)?|\.local\/secrets|\.backups)(?=$|[\/\s'"])/

function block(reason) {
  process.stderr.write(`Blocked by .claude/hooks/protect-files.mjs: ${reason}\n`)
  process.exit(2)
}

if (tool === 'Bash') {
  const cmd = String(args.command ?? '')
  if (SECRET_PATH.test(cmd)) {
    block('command references a secret file (.env*, .local/secrets, .backups). Use .env.example for variable names, or ask the user.')
  }
  process.exit(0)
}

const file = args.file_path ?? args.path ?? args.notebook_path
if (!file) process.exit(0)
const abs = path.resolve(root, String(file))
const rel = path.relative(root, abs).split(path.sep).join('/')

if (SECRET_PATH.test(rel) || SECRET_PATH.test('/' + rel)) {
  block(`${rel} is a secret file. Use .env.example for variable names, or ask the user.`)
}

const isWrite = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)
if (isWrite && /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(rel) && existsSync(abs)) {
  block(`${rel} is an existing migration. Never edit applied migrations; create a new one with npm run db:migrate -- --name <change>.`)
}

process.exit(0)
