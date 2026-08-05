-- Persist the only scorelines that are intentionally public so read paths no
-- longer need the private canonical/complete solution columns.
ALTER TABLE "puzzles"
ADD COLUMN "initialRevealedMatches" JSONB NOT NULL DEFAULT '[]'::jsonb;

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

DROP FUNCTION scorelogic_fnv1a32(TEXT);

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

CREATE TRIGGER "puzzles_immutable_initial_reveals"
BEFORE UPDATE ON "puzzles"
FOR EACH ROW EXECUTE FUNCTION prevent_initial_revealed_matches_update();

-- Stable keyset pagination for per-user progress ordered by newest update.
CREATE INDEX "user_puzzle_progress_user_updated_id_idx"
ON "user_puzzle_progress"("userId", "updatedAt" DESC, "id" DESC);
