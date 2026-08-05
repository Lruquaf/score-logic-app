-- Application validation owns the mathematical invariants. These checks are a
-- final database guard against bypassing the publisher with malformed JSON or
-- contradictory mode metadata. NOT VALID preserves explicitly supported legacy
-- rows while enforcing the contract for every new or changed row.
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
