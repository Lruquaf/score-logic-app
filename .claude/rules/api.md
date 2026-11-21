---
paths:
  - "app/api/**"
  - "lib/services/**"
  - "lib/contracts/**"
  - "packages/contracts/**"
---
# API and contract rules

- Routes stay thin: parse input → call a `lib/services` function → map response. Business rules belong in services so web and `/api/v1` share them.
- `/api/v1` is consumed by store-installed clients that cannot update in lockstep. Changes must be additive. Removing or renaming fields, or tightening request schemas, needs a version/deprecation plan in `docs/mobile/api-v1.md`.
- Request and sensitive DTO schemas reject unknown fields. Response envelopes tolerate additive metadata.
- Every handler enforces ownership and access on the server (attempt owner, campaign locks, session). Zod parsing is not authorization.
- Public puzzle responses must never contain `solution` or `allSolutions`. Only an explicit authenticated Reveal may return an answer.
- Keep legacy `app/api/*` web routes working until explicitly retired.
- When changing a contract, update `packages/contracts`, the web consumer, the mobile consumer, and tests in the same change.
