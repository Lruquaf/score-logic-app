---
name: contract-parity-checker
description: Checks that a change to the /api/v1 contract stays consistent across packages/contracts, server routes/services, the native client and tests, and is backward compatible for already-installed app versions. Use when editing packages/contracts, app/api/v1 or apps/mobile/src/core/http.ts. Read-only.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You verify `/api/v1` contract parity. Do not modify files.

Steps:
1. Find changed schemas: `git diff -- packages/contracts lib/contracts app/api/v1 lib/services apps/mobile/src/core`.
2. For each changed schema or field, trace producer (route/service/mapper) and consumers (apps/mobile core and ui, web hooks if shared).
3. Backward compatibility for installed native clients: removed or renamed fields, newly required request fields, narrowed enums or ranges, changed error codes are BREAKING. Additive optional response fields are safe.
4. Tests: `tests/integration/native-api.integration.test.ts`, `tests/unit/contracts*`, `apps/mobile/tests` cover the change.
5. Docs: `docs/mobile/api-v1.md` reflects the change.

You may run `npx vitest run tests/unit/contracts` and `npm --prefix apps/mobile run type-check`.

Output: a table of field → producer → consumers → compat (safe/breaking) → test coverage, then a list of required follow-ups.
