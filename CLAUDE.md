@AGENTS.md

# ScoreLogic

Daily football score / league-table logic puzzles. Two clients share one backend:
- **Web + backend** (repo root): Next.js 16 App Router, React 19, Prisma 5 / PostgreSQL, NextAuth v5, Upstash rate limit, Sentry/OTel, deployed on Railway.
- **Native client** (`apps/mobile`): Expo SDK 58, React Native 0.88, React Navigation, SQLite/SecureStore. Talks to `/api/v1` only, never a WebView.
- **Shared** (`packages/contracts`): public `/api/v1` Zod schemas. Imports only Zod. No Prisma, Next, engine, secrets, or `@/` alias.

## Communication
- Reply to the user in Turkish. Code, identifiers, commit messages and these instruction files stay in English.
- Existing docs under `docs/` are Turkish; keep editing them in Turkish.

## Commands (root, npm, Node 22)
- Verify fast: `npm run type-check && npm run lint && npm run test:unit`
- Integration (needs local Postgres via `npm run local:up`): `npm run test:integration:local`
- E2E: `npm run test:e2e` · Engine perf budget: `npm run perf:check`
- Local stack: `npm run local:up | local:status | local:down` → http://127.0.0.1:3007
- Mobile (run inside `apps/mobile`, it has its own lockfile/node_modules): `npm run type-check`, `npm test`, `npm run test:components`, `npm run check:a11y`, `npm run check:export`
- Design studio (real native UI on web with fixtures): `npm run design:studio` → http://localhost:8082
- Use the `/verify` skill to run the right checks for what changed.

## Map
- `app/api/v1/**` versioned API for native; `app/api/**` legacy web routes (keep compatible).
- `lib/services/**` shared application services used by both web and v1 routes. Business rules live here, not in routes.
- `lib/engine/**` solver, validator, hint, scoring, generator, difficulty. Server-only.
- `lib/puzzles/**` publication, QA, campaign access, daily buffer, answer reveal.
- `lib/auth/**` web cookie auth + `lib/auth/native` token sessions; anonymous/guest merge.
- `prisma/` schema + migrations; `scripts/` ops & content CLIs (see README).
- `apps/mobile/src/core` client core (session, outbox, sqlite, http); `apps/mobile/src/ui` screens.

## Source of truth (read before changing behavior)
- Product behavior: `docs/product-rules.md` (canonical; overrides older MVP/technical docs).
- Mobile decisions K01–K20: `docs/mobile/karar-kaydi.md`. API v1: `docs/mobile/api-v1.md`.
- Design: `docs/mobile/ui-ux-tasarim-sistemi-2026-11-20.md` (native), `docs/design-system.md` (web).
- `mvp-dokumani-futbol-puzzle.md` and `teknik-dokuman-scorelogic-web.md` are historical and large. Do not load them unless asked.

## Hard rules
- Solutions are server-private. Never send `solution` / `allSolutions` / solver output in public DTOs, and never import `lib/engine`, Prisma or server env into `apps/mobile` or `packages/contracts`.
- Validation is solve-any: a board is correct if it matches ANY solution in `allSolutions`.
- Daily business date is Europe/Istanbul and server-decided. Official time comes from the server attempt start, never the device clock.
- Mutations are idempotent: keep `requestId` / command UUID stable on retry, respect `baseRevision` / `expectedHintCount` conflicts (409).
- Never edit an already-applied migration in `prisma/migrations/`. Create a new one.
- Never run commands that touch production or shared databases (`db:deploy`, `db:release`, `db:push`, `ops:restore*`) without asking first.
- Do not read or print `.env`, `.env.local`, `.local/secrets`, or `.backups`. Use `.env.example` for variable names.
- Do not remove the Next.js block in `AGENTS.md`; `next dev` regenerates it.

## Working style
- Think before coding: state assumptions, ask when the request is ambiguous.
- Simplicity first: the smallest change that fully solves it, reusing existing helpers. No speculative abstractions or new dependencies without asking.
- Surgical changes: touch only what the task needs. No drive-by refactors or formatting churn.
- Goal-driven: define how success is verified (test, script, screenshot) and verify it. Add a regression test for every bug fix.
- Small fixes: just do them. Multi-file features or anything touching auth, sessions, engine or migrations: plan first (Superpowers brainstorming/writing-plans), then implement.
- Never claim checks passed unless you ran them. Report what you ran and what you skipped.
- For version-sensitive APIs (Next 16, Expo 58, RN 0.88, NextAuth v5, Zod 4, Prisma), check docs (Context7 / Expo MCP / `node_modules/next/dist/docs/`) instead of memory.
