-- Wave 14: separate automated QA evidence from human/editorial approval and
-- preserve every review, scheduling, activation, retirement, and rollback action.
CREATE TYPE "EditorialReviewStatus" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED'
);

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

ALTER TABLE "puzzles"
  ADD COLUMN "editorialStatus" "EditorialReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN "editorialReviewedAt" TIMESTAMP(3),
  ADD COLUMN "editorialReviewedBy" VARCHAR(128),
  ADD COLUMN "editorialReviewNote" VARCHAR(2000),
  ADD COLUMN "scheduledActivationAt" TIMESTAMP(3);

UPDATE "puzzles"
SET
  "editorialStatus" = 'APPROVED',
  "editorialReviewedAt" = "publishedAt",
  "editorialReviewedBy" = 'system:wave-14-backfill',
  "editorialReviewNote" = 'Approved during the Wave 14 lifecycle backfill.'
WHERE "isTested" = TRUE;

CREATE TABLE "puzzle_editorial_events" (
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
WHERE "isTested" = TRUE;

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
WHERE "isTested" = TRUE;

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
WHERE "isActive" = TRUE;

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
WHERE "retiredAt" IS NOT NULL;

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

CREATE INDEX "puzzles_editorialStatus_scheduledActivationAt_idx"
  ON "puzzles"("editorialStatus", "scheduledActivationAt");

CREATE UNIQUE INDEX "puzzles_one_scheduled_revision_per_content_key"
  ON "puzzles"("contentKey")
  WHERE "scheduledActivationAt" IS NOT NULL;

CREATE INDEX "puzzle_editorial_events_puzzleId_createdAt_idx"
  ON "puzzle_editorial_events"("puzzleId", "createdAt");
CREATE INDEX "puzzle_editorial_events_contentKey_contentRevision_createdAt_idx"
  ON "puzzle_editorial_events"("contentKey", "contentRevision", "createdAt");
CREATE INDEX "puzzle_editorial_events_type_createdAt_idx"
  ON "puzzle_editorial_events"("type", "createdAt");

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

CREATE TRIGGER "puzzle_editorial_events_prevent_update"
BEFORE UPDATE ON "puzzle_editorial_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_editorial_event_mutation();

CREATE TRIGGER "puzzle_editorial_events_prevent_delete"
BEFORE DELETE ON "puzzle_editorial_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_editorial_event_mutation();
