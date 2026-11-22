# @scorelogic/contracts

Public `/api/v1` runtime Zod schemas for the web server and native clients. The
package imports only Zod and its own files. It does not export or depend on Prisma,
Next.js, private puzzle engines, environment secrets, or the web `@/` alias.

The package exports TypeScript source; consuming bundlers (Next/Metro) compile it.
Existing `lib/contracts` and web routes remain compatible and are not moved.
Scores retain the legacy wire range 0–20; the current player editor offers 0–19.
Public reads strip unknown keys; leak protection is the server's public DTO guard
(`lib/validations.ts` / `lib/db/mappers/puzzle.ts`), not these schemas. Explicit authenticated Reveal
responses may contain the answer, as required by the existing product behavior.

Requests and sensitive DTOs reject unknown fields; outer envelopes tolerate
additive metadata by dropping unknown fields. Request schema changes must be
coordinated with the supported client/API version window. A parsed payload is a
wire shape, not proof of ownership, access, revision, or mathematical correctness;
those checks remain server-side.

## Forward compatibility (1.3.0)

Responses are tolerant, requests are strict. Response schemas use `z.object`
(unknown fields are stripped, never passed through) and non-structural enums use
`openEnum`, so a newer server value survives as a string; branch with `isKnown`
and never map an unknown value to a known one. Structural enums (`side`, match
outcome) and client-chosen request fields (`hintType`, attempt `kind`, delete
`confirmation`) stay closed. Request schemas use `z.strictObject`; shared shapes
have `*RequestSchema` variants. Leak protection for private solutions lives in
the server DTO guard, not in these client schemas.
