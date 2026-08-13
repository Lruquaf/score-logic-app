-- Persist the only scorelines that are intentionally public so read paths no
-- longer need the private canonical/complete solution columns.
BEGIN;

ALTER TABLE "puzzles"
ADD COLUMN IF NOT EXISTS "initialRevealedMatches" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION scorelogic_fnv1a32(input_text TEXT)
RETURNS BIGINT AS $$
DECLARE
  hash_value NUMERIC := 2166136261;
  position INTEGER;
BEGIN
  FOR position IN 1..length(input_text) LOOP
    hash_value := mod(
      (hash_value::BIGINT # ascii(substr(input_text, position, 1)))::NUMERIC * 16777619,
      4294967296
    );
  END LOOP;
  RETURN hash_value::BIGINT;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- Legacy rows may still violate the deliberately NOT VALID content checks.
-- Suspend them while this derived public projection is backfilled, then restore
-- the exact guards for every future insert/update.
ALTER TABLE "puzzles"
  DROP CONSTRAINT IF EXISTS "puzzles_non_negative_inference_steps",
  DROP CONSTRAINT IF EXISTS "puzzles_publication_metrics",
  DROP CONSTRAINT IF EXISTS "puzzles_mode_metadata",
  DROP CONSTRAINT IF EXISTS "puzzles_json_shapes",
  DROP CONSTRAINT IF EXISTS "puzzles_publication_metadata",
  DROP CONSTRAINT IF EXISTS "puzzles_active_requires_tested";

UPDATE "puzzles" AS puzzle
SET "initialRevealedMatches" = COALESCE(
  (
    SELECT jsonb_agg(selected.match_value ORDER BY selected.match_value->>'id')
    FROM (
      SELECT elements.solution_match AS match_value
      FROM jsonb_array_elements(puzzle."solution") AS elements(solution_match)
      ORDER BY
        scorelogic_fnv1a32(
          puzzle."id" || ':' || (elements.solution_match->>'id')
        ),
        elements.solution_match->>'id'
      LIMIT CASE
        WHEN puzzle."campaignPack" = 'BEGINNER' AND puzzle."campaignLevel" <= 3 THEN 5
        WHEN puzzle."campaignPack" = 'BEGINNER' AND puzzle."campaignLevel" <= 15 THEN 4
        WHEN puzzle."campaignPack" = 'BEGINNER' THEN 3
        WHEN puzzle."campaignPack" = 'EASY' THEN 3
        WHEN puzzle."campaignPack" = 'MEDIUM' THEN 2
        WHEN puzzle."campaignPack" = 'HARD' THEN 1
        ELSE 0
      END
    ) AS selected
  ),
  '[]'::jsonb
);

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

DROP FUNCTION IF EXISTS scorelogic_fnv1a32(TEXT);

ALTER TABLE "puzzles"
DROP CONSTRAINT IF EXISTS "puzzles_initial_reveals_are_bounded_array";

ALTER TABLE "puzzles"
ADD CONSTRAINT "puzzles_initial_reveals_are_bounded_array"
CHECK (
  jsonb_typeof("initialRevealedMatches") = 'array' AND
  jsonb_array_length("initialRevealedMatches") <= 6
);

CREATE OR REPLACE FUNCTION prevent_initial_revealed_matches_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."initialRevealedMatches" IS DISTINCT FROM NEW."initialRevealedMatches" THEN
    RAISE EXCEPTION 'Published puzzle initial reveals are immutable. Publish a new revision instead.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "puzzles_immutable_initial_reveals" ON "puzzles";
CREATE TRIGGER "puzzles_immutable_initial_reveals"
BEFORE UPDATE ON "puzzles"
FOR EACH ROW EXECUTE FUNCTION prevent_initial_revealed_matches_update();

-- Stable keyset pagination for per-user progress ordered by newest update.
CREATE INDEX IF NOT EXISTS "user_puzzle_progress_user_updated_id_idx"
ON "user_puzzle_progress"("userId", "updatedAt" DESC, "id" DESC);

COMMIT;
