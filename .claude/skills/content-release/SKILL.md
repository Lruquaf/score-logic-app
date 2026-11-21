---
name: content-release
description: Guide the ScoreLogic puzzle content pipeline (publish → editorial review → daily buffer → audit). Use only when the user explicitly asks to add, review, schedule or audit puzzle content.
disable-model-invocation: true
---

# Puzzle content release

Content is immutable once published and every activation needs a human actor. Read the content section of `README.md` and `docs/product-rules.md` first.

1. Confirm the target database with the user (local vs remote). Never assume production. Run `npm run local:status` for local.
2. Stage: `npm run db:publish` → creates passive `PENDING_REVIEW` revisions only if JSON/domain, round-robin, standings, solve-any set, metadata, difficulty, prefill and content QA all pass. Show the user the output.
3. Review: the user approves. You prepare the command and the user confirms each one:
   `npm run db:editorial -- --content-key <key> --revision <n> --approve --actor <identity>` (also supports change request, reject, schedule, activate, rollback).
4. Daily window: `npm run db:daily-buffer -- --check` (exit 2 = `GAP` or `REVIEW_REQUIRED`), then `npm run db:daily-buffer` to stage missing days (default 15 days, Europe/Istanbul).
5. Audit: `npm run db:audit-content` must exit 0.
6. Summarize in Turkish: what was staged, approved, scheduled, and any open gaps.

Never edit published content in SQL, never fabricate an `--actor`, and never run these against a remote DB without explicit approval for that run.
