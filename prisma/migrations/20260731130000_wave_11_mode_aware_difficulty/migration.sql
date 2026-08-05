-- Wave 11: keep mathematical table complexity separate from presentation
-- complexity and persist the deterministic effective difficulty score.
-- Legacy rows may still violate Wave 7 NOT VALID checks. PostgreSQL rechecks
-- those constraints on UPDATE, so suspend and recreate them around backfill.
ALTER TABLE "puzzles"
  DROP CONSTRAINT "puzzles_non_negative_inference_steps",
  DROP CONSTRAINT "puzzles_publication_metrics",
  DROP CONSTRAINT "puzzles_mode_metadata",
  DROP CONSTRAINT "puzzles_json_shapes",
  DROP CONSTRAINT "puzzles_publication_metadata",
  DROP CONSTRAINT "puzzles_active_requires_tested";

ALTER TABLE "puzzles"
  ADD COLUMN "presentationDifficultyScore" INTEGER,
  ADD COLUMN "effectiveDifficultyScore" INTEGER;

WITH difficulty_inputs AS (
  SELECT
    "id",
    COALESCE(
      "tableDifficultyScore",
      CASE "difficulty"
        WHEN 'EASY' THEN 20
        WHEN 'MEDIUM' THEN 33
        ELSE 50
      END
    ) AS table_score,
    CASE
      WHEN "dailyDate" IS NOT NULL THEN 0
      WHEN "campaignPack" = 'BEGINNER' AND "campaignLevel" <= 3 THEN 5
      WHEN "campaignPack" = 'BEGINNER' AND "campaignLevel" <= 15 THEN 4
      WHEN "campaignPack" = 'BEGINNER' THEN 3
      WHEN "campaignPack" = 'EASY' THEN 3
      WHEN "campaignPack" = 'MEDIUM' THEN 2
      WHEN "campaignPack" = 'HARD' THEN 1
      ELSE 0
    END AS prefilled_matches,
    CASE
      WHEN "dailyDate" IS NOT NULL AND COALESCE(
        "tableDifficultyScore",
        CASE "difficulty"
          WHEN 'EASY' THEN 20
          WHEN 'MEDIUM' THEN 33
          ELSE 50
        END
      ) > 42 THEN 6
      WHEN "dailyDate" IS NOT NULL THEN 2
      WHEN "campaignPack" IN ('BEGINNER', 'EASY') THEN 0
      WHEN "campaignPack" = 'MEDIUM' THEN 3
      WHEN "campaignPack" = 'HARD' THEN 6
      ELSE 9
    END AS feedback_complexity,
    CASE
      WHEN "campaignPack" = 'BEGINNER' AND "campaignLevel" <= 3 THEN 4
      WHEN "campaignPack" = 'BEGINNER' AND "campaignLevel" <= 15 THEN 2
      ELSE 0
    END AS analyze_relief
  FROM "puzzles"
), presentation_scores AS (
  SELECT
    "id",
    table_score,
    GREATEST(
      0,
      (6 - prefilled_matches) * 5 + feedback_complexity - analyze_relief
    ) AS presentation_score
  FROM difficulty_inputs
)
UPDATE "puzzles" AS puzzle
SET
  "presentationDifficultyScore" = scores.presentation_score,
  "effectiveDifficultyScore" = GREATEST(
    1,
    ROUND(
      (scores.table_score * 2 + scores.presentation_score)::numeric / 3
    )::integer
  )
FROM presentation_scores AS scores
WHERE puzzle."id" = scores."id";

ALTER TABLE "puzzles"
  ALTER COLUMN "presentationDifficultyScore" SET NOT NULL,
  ALTER COLUMN "effectiveDifficultyScore" SET NOT NULL,
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

-- The new scores are deterministic derivatives of already-hashed immutable
-- content. Guard them against later drift without changing legacy hashes.
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
      OLD."presentationDifficultyScore" IS DISTINCT FROM NEW."presentationDifficultyScore" AND
      NOT (
        OLD."contentHash" = 'legacy-unverified' AND
        OLD."tableDifficultyScore" IS NULL
      )
    ) OR
    (
      OLD."effectiveDifficultyScore" IS DISTINCT FROM NEW."effectiveDifficultyScore" AND
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
