-- Wave 12: persist the deterministic automated content QA artifact that was
-- required before a revision could be marked tested by the publisher.
ALTER TABLE "puzzles"
  ADD COLUMN "contentQaVersion" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "contentQaReport" JSONB;

ALTER TABLE "puzzles"
  ADD CONSTRAINT "puzzles_content_qa_report_shape"
    CHECK (
      (
        "contentQaVersion" = 'legacy' AND
        "contentQaReport" IS NULL
      ) OR (
        length("contentQaVersion") BETWEEN 1 AND 128 AND
        jsonb_typeof("contentQaReport") = 'object' AND
        "contentQaReport" ->> 'version' = "contentQaVersion" AND
        "contentQaReport" ->> 'success' = 'true' AND
        jsonb_typeof("contentQaReport" -> 'metrics') = 'object' AND
        jsonb_typeof("contentQaReport" -> 'issues') = 'array' AND
        jsonb_array_length("contentQaReport" -> 'issues') = 0
      )
    ) NOT VALID;

CREATE INDEX "puzzles_contentQaVersion_idx"
  ON "puzzles"("contentQaVersion");

CREATE OR REPLACE FUNCTION prevent_published_puzzle_qa_update()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    OLD."contentQaVersion" IS DISTINCT FROM NEW."contentQaVersion" OR
    OLD."contentQaReport" IS DISTINCT FROM NEW."contentQaReport"
  ) AND NOT (
    OLD."contentQaVersion" = 'legacy' AND
    OLD."contentQaReport" IS NULL
  ) THEN
    RAISE EXCEPTION 'Published puzzle content QA evidence is immutable. Publish a new revision instead.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "puzzles_prevent_qa_update"
BEFORE UPDATE ON "puzzles"
FOR EACH ROW
EXECUTE FUNCTION prevent_published_puzzle_qa_update();
