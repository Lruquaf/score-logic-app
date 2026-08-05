-- Separate the logical puzzle identity from immutable physical revisions.
-- Wave 7 deliberately left legacy rows unvalidated. PostgreSQL rechecks NOT
-- VALID constraints whenever a row is touched, so suspend and recreate them
-- around the identity backfill.
ALTER TABLE "puzzles"
  DROP CONSTRAINT "puzzles_non_negative_inference_steps",
  DROP CONSTRAINT "puzzles_publication_metrics",
  DROP CONSTRAINT "puzzles_mode_metadata",
  DROP CONSTRAINT "puzzles_json_shapes",
  DROP CONSTRAINT "puzzles_publication_metadata",
  DROP CONSTRAINT "puzzles_active_requires_tested";

ALTER TABLE "puzzles"
  ADD COLUMN "contentKey" TEXT,
  ADD COLUMN "contentRevision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "supersedesId" TEXT,
  ADD COLUMN "activatedAt" TIMESTAMP(3),
  ADD COLUMN "retiredAt" TIMESTAMP(3);

UPDATE "puzzles"
SET
  "contentKey" = CASE
    WHEN "dailyDate" IS NOT NULL
      THEN 'daily:' || to_char("dailyDate", 'YYYY-MM-DD')
    WHEN "campaignPack" IS NOT NULL AND "campaignLevel" IS NOT NULL
      THEN 'campaign:' || lower("campaignPack"::text) || ':' || "campaignLevel"::text
    ELSE 'puzzle:' || "id"
  END,
  "contentRevision" = CASE
    WHEN "contentVersion" ~ '-v[1-9][0-9]*$'
      THEN substring("contentVersion" FROM '-v([1-9][0-9]*)$')::INTEGER
    ELSE 1
  END,
  "activatedAt" = CASE WHEN "isActive" THEN "publishedAt" ELSE NULL END,
  "retiredAt" = CASE WHEN "isActive" THEN NULL ELSE "publishedAt" END;

ALTER TABLE "puzzles"
  ALTER COLUMN "contentKey" SET NOT NULL;

ALTER TABLE "puzzles"
  ADD CONSTRAINT "puzzles_non_negative_inference_steps"
    CHECK ("inferenceSteps" >= 0) NOT VALID,
  ADD CONSTRAINT "puzzles_publication_metrics"
    CHECK (
      "tableDifficultyScore" IS NOT NULL AND
      "tableDifficultyScore" >= 0 AND
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

-- Multiple immutable revisions may share their daily/campaign slot. Only one
-- validated revision can be active for a logical content key at a time.
DROP INDEX "puzzles_dailyDate_key";
DROP INDEX "puzzles_campaignOrder_key";

CREATE UNIQUE INDEX "puzzles_contentKey_contentRevision_key"
  ON "puzzles"("contentKey", "contentRevision");
CREATE UNIQUE INDEX "puzzles_supersedesId_key"
  ON "puzzles"("supersedesId");
CREATE INDEX "puzzles_contentKey_isActive_idx"
  ON "puzzles"("contentKey", "isActive");
CREATE UNIQUE INDEX "puzzles_one_active_content_key"
  ON "puzzles"("contentKey")
  WHERE "isActive" = true;
CREATE UNIQUE INDEX "puzzles_one_active_daily_date"
  ON "puzzles"("dailyDate")
  WHERE "isActive" = true AND "dailyDate" IS NOT NULL;
CREATE UNIQUE INDEX "puzzles_one_active_campaign_order"
  ON "puzzles"("campaignOrder")
  WHERE "isActive" = true AND "campaignOrder" IS NOT NULL;

ALTER TABLE "puzzles"
  ADD CONSTRAINT "puzzles_supersedesId_fkey"
    FOREIGN KEY ("supersedesId") REFERENCES "puzzles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "puzzles_content_revision_positive"
    CHECK ("contentRevision" >= 1),
  ADD CONSTRAINT "puzzles_content_version_matches_revision"
    CHECK (
      "contentVersion" ~
        ('-v' || "contentRevision"::text || '$')
    ),
  ADD CONSTRAINT "puzzles_content_key_matches_slot"
    CHECK (
      (
        "dailyDate" IS NOT NULL AND
        "contentKey" = 'daily:' || to_char("dailyDate", 'YYYY-MM-DD')
      ) OR (
        "campaignPack" IS NOT NULL AND
        "campaignLevel" IS NOT NULL AND
        "contentKey" =
          'campaign:' || lower("campaignPack"::text) || ':' || "campaignLevel"::text
      )
    ),
  ADD CONSTRAINT "puzzles_revision_lifecycle"
    CHECK (
      (
        "isActive" = true AND
        "isTested" = true AND
        "activatedAt" IS NOT NULL AND
        "retiredAt" IS NULL
      ) OR (
        "isActive" = false
      )
    );

-- A logical puzzle is solved once even if it later receives a new physical revision.
ALTER TABLE "puzzle_completions" ADD COLUMN "contentKey" TEXT;

UPDATE "puzzle_completions" AS completion
SET "contentKey" = puzzle."contentKey"
FROM "puzzles" AS puzzle
WHERE puzzle."id" = completion."puzzleId";

ALTER TABLE "puzzle_completions"
  ALTER COLUMN "contentKey" SET NOT NULL;

CREATE UNIQUE INDEX "puzzle_completions_userId_contentKey_key"
  ON "puzzle_completions"("userId", "contentKey");

CREATE OR REPLACE FUNCTION validate_puzzle_revision_chain()
RETURNS TRIGGER AS $$
DECLARE
  previous_revision RECORD;
BEGIN
  IF NEW."contentRevision" = 1 THEN
    IF NEW."supersedesId" IS NOT NULL THEN
      RAISE EXCEPTION 'Puzzle revision 1 cannot supersede another revision.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."supersedesId" IS NULL THEN
    RAISE EXCEPTION 'Puzzle revision % must supersede revision %.',
      NEW."contentRevision", NEW."contentRevision" - 1;
  END IF;

  SELECT "contentKey", "contentRevision"
  INTO previous_revision
  FROM "puzzles"
  WHERE "id" = NEW."supersedesId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Puzzle supersession target does not exist.';
  END IF;

  IF
    previous_revision."contentKey" IS DISTINCT FROM NEW."contentKey" OR
    previous_revision."contentRevision" IS DISTINCT FROM NEW."contentRevision" - 1
  THEN
    RAISE EXCEPTION 'Puzzle supersession must reference the previous revision of the same content key.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "puzzles_validate_revision_chain"
BEFORE INSERT OR UPDATE ON "puzzles"
FOR EACH ROW
EXECUTE FUNCTION validate_puzzle_revision_chain();

CREATE OR REPLACE FUNCTION validate_puzzle_completion_content_key()
RETURNS TRIGGER AS $$
DECLARE
  puzzle_content_key TEXT;
BEGIN
  SELECT "contentKey"
  INTO puzzle_content_key
  FROM "puzzles"
  WHERE "id" = NEW."puzzleId";

  IF puzzle_content_key IS NULL OR puzzle_content_key IS DISTINCT FROM NEW."contentKey" THEN
    RAISE EXCEPTION 'Puzzle completion content key must match its puzzle revision.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "puzzle_completions_validate_content_key"
BEFORE INSERT OR UPDATE ON "puzzle_completions"
FOR EACH ROW
EXECUTE FUNCTION validate_puzzle_completion_content_key();

-- Extend the existing immutable publication trigger with revision identity.
CREATE OR REPLACE FUNCTION prevent_published_puzzle_content_update()
RETURNS TRIGGER AS $$
BEGIN
  IF
    OLD."contentKey" IS DISTINCT FROM NEW."contentKey" OR
    OLD."contentRevision" IS DISTINCT FROM NEW."contentRevision" OR
    OLD."supersedesId" IS DISTINCT FROM NEW."supersedesId" OR
    OLD."difficulty" IS DISTINCT FROM NEW."difficulty" OR
    OLD."inferenceSteps" IS DISTINCT FROM NEW."inferenceSteps" OR
    OLD."teamsConfig" IS DISTINCT FROM NEW."teamsConfig" OR
    OLD."standings" IS DISTINCT FROM NEW."standings" OR
    OLD."matchIds" IS DISTINCT FROM NEW."matchIds" OR
    OLD."solution" IS DISTINCT FROM NEW."solution" OR
    (
      OLD."allSolutions" IS DISTINCT FROM NEW."allSolutions" AND
      NOT (
        OLD."contentHash" = 'legacy-unverified' AND
        OLD."allSolutions" IS NULL
      )
    ) OR
    OLD."dailyDate" IS DISTINCT FROM NEW."dailyDate" OR
    OLD."campaignOrder" IS DISTINCT FROM NEW."campaignOrder" OR
    OLD."campaignPack" IS DISTINCT FROM NEW."campaignPack" OR
    OLD."campaignLevel" IS DISTINCT FROM NEW."campaignLevel" OR
    (
      OLD."tableDifficultyScore" IS DISTINCT FROM NEW."tableDifficultyScore" AND
      NOT (
        OLD."contentHash" = 'legacy-unverified' AND
        OLD."tableDifficultyScore" IS NULL
      )
    ) OR
    (
      OLD."solutionCount" IS DISTINCT FROM NEW."solutionCount" AND
      NOT (
        OLD."contentHash" = 'legacy-unverified' AND
        OLD."solutionCount" IS NULL
      )
    )
  THEN
    RAISE EXCEPTION 'Published puzzle revision content is immutable. Publish a new revision instead.';
  END IF;

  IF OLD."contentHash" <> 'legacy-unverified' AND (
    OLD."contentVersion" IS DISTINCT FROM NEW."contentVersion" OR
    OLD."generatorVersion" IS DISTINCT FROM NEW."generatorVersion" OR
    OLD."rulesVersion" IS DISTINCT FROM NEW."rulesVersion" OR
    OLD."contentHash" IS DISTINCT FROM NEW."contentHash" OR
    OLD."publishedAt" IS DISTINCT FROM NEW."publishedAt"
  ) THEN
    RAISE EXCEPTION 'Published puzzle version metadata is immutable.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
