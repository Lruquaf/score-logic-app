-- Wave 14: separate automated QA evidence from human/editorial approval and
-- preserve every review, scheduling, activation, retirement, and rollback action.
-- Prisma does not wrap PostgreSQL migrations in a transaction by default. The
-- guards below make a retry safe when a previous attempt stopped after DDL but
-- before its migration ledger entry was completed.
BEGIN;

DO $$
BEGIN
  CREATE TYPE "EditorialReviewStatus" AS ENUM (
    'PENDING_REVIEW',
    'APPROVED',
    'CHANGES_REQUESTED',
    'REJECTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "EditorialEventType" AS ENUM (
    'SUBMITTED',
    'APPROVED',
    'CHANGES_REQUESTED',
    'REJECTED',
    'ACTIVATION_SCHEDULED',
    'ACTIVATION_CANCELLED',
    'ACTIVATED',
    'RETIRED',
    'ROLLED_BACK'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "puzzles"
  ADD COLUMN IF NOT EXISTS "editorialStatus" "EditorialReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN IF NOT EXISTS "editorialReviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "editorialReviewedBy" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "editorialReviewNote" VARCHAR(2000),
  ADD COLUMN IF NOT EXISTS "scheduledActivationAt" TIMESTAMP(3);

-- Legacy rows intentionally predate complete solve-set persistence and can
-- violate Wave 11 NOT VALID checks. PostgreSQL still evaluates those checks on
-- UPDATE, so suspend and recreate them around the editorial metadata backfill.
ALTER TABLE "puzzles"
  DROP CONSTRAINT IF EXISTS "puzzles_non_negative_inference_steps",
  DROP CONSTRAINT IF EXISTS "puzzles_publication_metrics",
  DROP CONSTRAINT IF EXISTS "puzzles_mode_metadata",
  DROP CONSTRAINT IF EXISTS "puzzles_json_shapes",
  DROP CONSTRAINT IF EXISTS "puzzles_publication_metadata",
  DROP CONSTRAINT IF EXISTS "puzzles_active_requires_tested";

UPDATE "puzzles"
SET
  "editorialStatus" = 'APPROVED',
  "editorialReviewedAt" = "publishedAt",
  "editorialReviewedBy" = 'system:wave-14-backfill',
  "editorialReviewNote" = 'Approved during the Wave 14 lifecycle backfill.'
WHERE "isTested" = TRUE;

ALTER TABLE "puzzles"
  ADD CONSTRAINT "puzzles_non_negative_inference_steps"
    CHECK ("inferenceSteps" >= 0) NOT VALID,
  ADD CONSTRAINT "puzzles_publication_metrics"
    CHECK (
      "tableDifficultyScore" IS NOT NULL AND
      "tableDifficultyScore" >= 0 AND
      "presentationDifficultyScore" >= 0 AND
      "effectiveDifficultyScore" >= 1 AND
      "solutionCount" IS NOT NULL AND
      "solutionCount" >= 1
    ) NOT VALID,
  ADD CONSTRAINT "puzzles_mode_metadata"
    CHECK (
      (
        "dailyDate" IS NOT NULL AND
        "campaignOrder" IS NULL AND
        "campaignPack" IS NULL AND
        "campaignLevel" IS NULL
      ) OR (
        "dailyDate" IS NULL AND
        "campaignOrder" IS NOT NULL AND
        "campaignPack" IS NOT NULL AND
        "campaignLevel" BETWEEN 1 AND 30
      )
    ) NOT VALID,
  ADD CONSTRAINT "puzzles_json_shapes"
    CHECK (
      jsonb_typeof("teamsConfig") = 'array' AND
      jsonb_array_length("teamsConfig") = 4 AND
      jsonb_typeof("standings") = 'array' AND
      jsonb_array_length("standings") = 4 AND
      jsonb_typeof("matchIds") = 'array' AND
      jsonb_array_length("matchIds") = 6 AND
      jsonb_typeof("solution") = 'array' AND
      jsonb_array_length("solution") = 6 AND
      "allSolutions" IS NOT NULL AND
      jsonb_typeof("allSolutions") = 'array' AND
      jsonb_array_length("allSolutions") >= 1
    ) NOT VALID,
  ADD CONSTRAINT "puzzles_publication_metadata"
    CHECK (
      length("contentVersion") BETWEEN 1 AND 128 AND
      length("generatorVersion") BETWEEN 1 AND 128 AND
      length("rulesVersion") BETWEEN 1 AND 128 AND
      (
        "contentHash" = 'legacy-unverified' OR
        "contentHash" ~ '^[0-9a-f]{64}$'
      )
    ) NOT VALID,
  ADD CONSTRAINT "puzzles_active_requires_tested"
    CHECK (NOT "isActive" OR "isTested") NOT VALID;

CREATE TABLE IF NOT EXISTS "puzzle_editorial_events" (
  "id" TEXT NOT NULL,
  "puzzleId" TEXT NOT NULL,
  "contentKey" TEXT NOT NULL,
  "contentRevision" INTEGER NOT NULL,
  "type" "EditorialEventType" NOT NULL,
  "actor" VARCHAR(128) NOT NULL,
  "note" VARCHAR(2000),
  "scheduledFor" TIMESTAMP(3),
  "previousPuzzleId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "puzzle_editorial_events_pkey" PRIMARY KEY ("id")
);

INSERT INTO "puzzle_editorial_events" (
  "id", "puzzleId", "contentKey", "contentRevision", "type", "actor", "note", "createdAt"
)
SELECT
  md5("id" || ':submitted:wave14'),
  "id",
  "contentKey",
  "contentRevision",
  'SUBMITTED',
  'system:wave-14-backfill',
  'Existing revision submitted during lifecycle backfill.',
  "publishedAt"
FROM "puzzles"
WHERE "isTested" = TRUE
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "puzzle_editorial_events" (
  "id", "puzzleId", "contentKey", "contentRevision", "type", "actor", "note", "createdAt"
)
SELECT
  md5("id" || ':approved:wave14'),
  "id",
  "contentKey",
  "contentRevision",
  'APPROVED',
  'system:wave-14-backfill',
  'Approved during the Wave 14 lifecycle backfill.',
  "publishedAt"
FROM "puzzles"
WHERE "isTested" = TRUE
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "puzzle_editorial_events" (
  "id", "puzzleId", "contentKey", "contentRevision", "type", "actor", "note",
  "previousPuzzleId", "createdAt"
)
SELECT
  md5("id" || ':activated:wave14'),
  "id",
  "contentKey",
  "contentRevision",
  'ACTIVATED',
  'system:wave-14-backfill',
  'Existing activation recorded during lifecycle backfill.',
  NULL,
  COALESCE("activatedAt", "publishedAt")
FROM "puzzles"
WHERE "isActive" = TRUE
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "puzzle_editorial_events" (
  "id", "puzzleId", "contentKey", "contentRevision", "type", "actor", "note", "createdAt"
)
SELECT
  md5("id" || ':retired:wave14'),
  "id",
  "contentKey",
  "contentRevision",
  'RETIRED',
  'system:wave-14-backfill',
  'Existing retirement recorded during lifecycle backfill.',
  "retiredAt"
FROM "puzzles"
WHERE "retiredAt" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "puzzles"
  DROP CONSTRAINT IF EXISTS "puzzles_editorial_review_metadata",
  DROP CONSTRAINT IF EXISTS "puzzles_editorial_rejection_note",
  DROP CONSTRAINT IF EXISTS "puzzles_active_requires_editorial_approval",
  DROP CONSTRAINT IF EXISTS "puzzles_activation_schedule_state";

ALTER TABLE "puzzles"
  ADD CONSTRAINT "puzzles_editorial_review_metadata"
    CHECK (
      (
        "editorialStatus" = 'PENDING_REVIEW' AND
        "editorialReviewedAt" IS NULL AND
        "editorialReviewedBy" IS NULL
      ) OR (
        "editorialStatus" <> 'PENDING_REVIEW' AND
        "editorialReviewedAt" IS NOT NULL AND
        length("editorialReviewedBy") BETWEEN 1 AND 128
      )
    ),
  ADD CONSTRAINT "puzzles_editorial_rejection_note"
    CHECK (
      "editorialStatus" NOT IN ('CHANGES_REQUESTED', 'REJECTED') OR
      length("editorialReviewNote") BETWEEN 1 AND 2000
    ),
  ADD CONSTRAINT "puzzles_active_requires_editorial_approval"
    CHECK (NOT "isActive" OR "editorialStatus" = 'APPROVED'),
  ADD CONSTRAINT "puzzles_activation_schedule_state"
    CHECK (
      "scheduledActivationAt" IS NULL OR (
        NOT "isActive" AND
        "isTested" AND
        "editorialStatus" = 'APPROVED'
      )
    );

CREATE INDEX IF NOT EXISTS "puzzles_editorialStatus_scheduledActivationAt_idx"
  ON "puzzles"("editorialStatus", "scheduledActivationAt");

CREATE UNIQUE INDEX IF NOT EXISTS "puzzles_one_scheduled_revision_per_content_key"
  ON "puzzles"("contentKey")
  WHERE "scheduledActivationAt" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "puzzle_editorial_events_puzzleId_createdAt_idx"
  ON "puzzle_editorial_events"("puzzleId", "createdAt");
CREATE INDEX IF NOT EXISTS "puzzle_editorial_events_contentKey_contentRevision_createdAt_idx"
  ON "puzzle_editorial_events"("contentKey", "contentRevision", "createdAt");
CREATE INDEX IF NOT EXISTS "puzzle_editorial_events_type_createdAt_idx"
  ON "puzzle_editorial_events"("type", "createdAt");

ALTER TABLE "puzzle_editorial_events"
  DROP CONSTRAINT IF EXISTS "puzzle_editorial_events_puzzleId_fkey";

ALTER TABLE "puzzle_editorial_events"
  ADD CONSTRAINT "puzzle_editorial_events_puzzleId_fkey"
  FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_editorial_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Puzzle editorial events are append-only.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "puzzle_editorial_events_prevent_update" ON "puzzle_editorial_events";
CREATE TRIGGER "puzzle_editorial_events_prevent_update"
BEFORE UPDATE ON "puzzle_editorial_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_editorial_event_mutation();

DROP TRIGGER IF EXISTS "puzzle_editorial_events_prevent_delete" ON "puzzle_editorial_events";
CREATE TRIGGER "puzzle_editorial_events_prevent_delete"
BEFORE DELETE ON "puzzle_editorial_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_editorial_event_mutation();

COMMIT;
