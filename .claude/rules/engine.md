---
paths:
  - "lib/engine/**"
  - "lib/puzzles/**"
  - "lib/difficulty/**"
---
# Puzzle engine rules

- `docs/product-rules.md` is canonical for solve-any, hint, reveal, replay, campaign access and stats semantics. Read the relevant section before changing behavior.
- Engine code is server-only. Do not export it through `packages/contracts` or anything the mobile bundle imports.
- Hints use the server's stored board (givens + earlier hints), never the client snapshot. A no-op hint must not increment `hintsUsed`.
- Any solver/validator/hint change needs unit tests in `tests/unit/engine` or `tests/unit/puzzles` with concrete boards, and `npm run perf:check` must still pass.
