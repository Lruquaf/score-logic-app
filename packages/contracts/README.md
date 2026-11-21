# @scorelogic/contracts

Public `/api/v1` runtime Zod schemas for the web server and native clients. The
package imports only Zod and its own files. It does not export or depend on Prisma,
Next.js, private puzzle engines, environment secrets, or the web `@/` alias.

The package exports TypeScript source; consuming bundlers (Next/Metro) compile it.
Existing `lib/contracts` and web routes remain compatible and are not moved.
Scores retain the legacy wire range 0–20; the current player editor offers 0–19.
Canonical public reads reject private solution keys. Explicit authenticated Reveal
responses may contain the answer, as required by the existing product behavior.

Requests and sensitive DTOs reject unknown fields; outer envelopes tolerate
additive metadata by dropping unknown fields. Request schema changes must be
coordinated with the supported client/API version window. A parsed payload is a
wire shape, not proof of ownership, access, revision, or mathematical correctness;
those checks remain server-side.
