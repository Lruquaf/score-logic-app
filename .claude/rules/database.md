---
paths:
  - "prisma/**"
  - "lib/db/**"
  - "scripts/**"
---
# Database and ops rules

- Schema change = `npm run db:migrate -- --name <change>` against the local DB, then commit the new migration folder. Never edit or delete an applied migration.
- Migrations must be backward compatible with the currently deployed web and with older native clients: expand → migrate data → contract in a later release.
- Integration tests only run against a database whose name ends in `_test`. Do not weaken that guard.
- Published puzzle content is immutable. New content goes through `db:publish` (creates a passive `PENDING_REVIEW` revision) and human approval via `db:editorial`. Never activate content by hand in SQL.
- Ops scripts that hit remote databases (`db:deploy`, `db:release`, `ops:backup`, `ops:restore*`) need explicit user approval each time.
