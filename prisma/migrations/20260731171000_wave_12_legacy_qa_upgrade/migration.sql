-- A legacy-unverified revision predates the canonical difficulty analyzer and
-- may therefore need a one-time derived difficulty/inference correction while
-- receiving its first complete domain + content-QA proof. Once its real hash is
-- written, the ordinary immutable path applies again.
CREATE OR REPLACE FUNCTION prevent_published_puzzle_content_update()
RETURNS TRIGGER AS $$
BEGIN
  IF
    OLD."contentKey" IS DISTINCT FROM NEW."contentKey" OR
    OLD."contentRevision" IS DISTINCT FROM NEW."contentRevision" OR
    OLD."supersedesId" IS DISTINCT FROM NEW."supersedesId" OR
    (
      OLD."difficulty" IS DISTINCT FROM NEW."difficulty" AND
      OLD."contentHash" <> 'legacy-unverified'
    ) OR
    (
      OLD."inferenceSteps" IS DISTINCT FROM NEW."inferenceSteps" AND
      OLD."contentHash" <> 'legacy-unverified'
    ) OR
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
