---
paths:
  - "apps/mobile/**"
---
# Native client rules (apps/mobile)

- Run npm/Expo commands from `apps/mobile`. Never update mobile deps from the root package. Use `npx expo install <pkg>` so versions match SDK 58, then `npx expo install --check`.
- Allowed shared code: `@scorelogic/contracts` only. No imports from root `lib/`, `@/`, Prisma, Next, or server env.
- Public config must use `EXPO_PUBLIC_*`. Any other secret in the bundle is a bug; `npm run check:export` enforces the private-source boundary.
- Writes go through the persistent command outbox with stable UUIDs and `baseRevision`. Never add an in-memory-only retry or a client-authoritative completion.
- Hint / Check / Reveal and official results require the server. Offline mode edits drafts only.
- UI: follow `docs/mobile/ui-ux-tasarim-sistemi-2026-11-20.md` (green scorebook, Figtree). Touch targets ≥ 44 px, respect reduced motion and large fonts, keep Final Table pinned.
- Check UI changes in the design studio (`npm run design:studio`, port 8082) and run `npm run test:components` + `npm run check:a11y`.
