---
name: verify
description: Run the right ScoreLogic checks (type-check, lint, unit, integration, mobile, perf) for the files changed and report results honestly. Use before saying a task is done, before committing, or when the user asks to verify/test.
---

# Verify ScoreLogic changes

1. List changed files: `git status --short` and `git diff --name-only HEAD`.
2. Pick checks by area. Run them; stop and fix on the first failure, then re-run.

| Changed area | Commands (from repo root) |
|---|---|
| Any root TS/TSX | `npm run type-check`, `npm run lint`, `npm run test:unit` |
| `lib/engine`, `lib/puzzles`, `lib/difficulty` | above + `npm run perf:check` |
| `prisma/`, `lib/db`, `lib/services`, `app/api`, `lib/auth` | above + `npm run test:integration:local` (needs `npm run local:up`; ask before starting it) |
| `packages/contracts` | root checks + all mobile checks |
| `apps/mobile/**` | `npm --prefix apps/mobile run type-check`, `npm --prefix apps/mobile test`, `npm --prefix apps/mobile run test:components`, `npm --prefix apps/mobile run check:a11y` |
| Mobile deps or env/config | also `cd apps/mobile && npx expo install --check` and `npm run export:native:maps && npm run check:export` |
| UI flows (web) | `npm run test:e2e` if the dev stack is up, or check the page with Playwright |

3. Optional reviews: auth/session/API → `security-reviewer`; DTO/contract/mobile imports → `puzzle-integrity-auditor`; `/api/v1` → `contract-parity-checker`.

4. Report in Turkish: each command run with pass/fail, anything skipped and why, and remaining risks. Never say "tests pass" for a command you did not run.
