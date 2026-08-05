-- Published puzzle metadata. Legacy rows remain readable and can be adopted once
-- by the explicit publisher after their content hash has been verified.
ALTER TABLE "puzzles"
ADD COLUMN "contentVersion" TEXT NOT NULL DEFAULT 'legacy-v1',
ADD COLUMN "generatorVersion" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN "rulesVersion" TEXT NOT NULL DEFAULT 'solve-any-v1',
ADD COLUMN "contentHash" VARCHAR(64) NOT NULL DEFAULT 'legacy-unverified',
ADD COLUMN "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- One durable receipt per client idempotency key prevents retries from mutating
-- progress twice. A separate unique completion ledger protects aggregate stats
-- even when two different request keys solve the same puzzle concurrently.
CREATE TABLE "puzzle_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "isFirstCompletion" BOOLEAN NOT NULL DEFAULT false,
    "progressSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "puzzle_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "puzzle_completions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "submissionId" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeTakenSec" INTEGER NOT NULL,
    "hintsUsed" INTEGER NOT NULL,

    CONSTRAINT "puzzle_completions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "puzzle_submissions_userId_idempotencyKey_key"
ON "puzzle_submissions"("userId", "idempotencyKey");

CREATE INDEX "puzzle_submissions_userId_puzzleId_createdAt_idx"
ON "puzzle_submissions"("userId", "puzzleId", "createdAt");

CREATE UNIQUE INDEX "puzzle_completions_submissionId_key"
ON "puzzle_completions"("submissionId");

CREATE UNIQUE INDEX "puzzle_completions_userId_puzzleId_key"
ON "puzzle_completions"("userId", "puzzleId");

CREATE INDEX "puzzle_completions_puzzleId_completedAt_idx"
ON "puzzle_completions"("puzzleId", "completedAt");

ALTER TABLE "puzzle_submissions"
ADD CONSTRAINT "puzzle_submissions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "puzzle_submissions"
ADD CONSTRAINT "puzzle_submissions_puzzleId_fkey"
FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "puzzle_completions"
ADD CONSTRAINT "puzzle_completions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "puzzle_completions"
ADD CONSTRAINT "puzzle_completions_puzzleId_fkey"
FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "puzzle_completions"
ADD CONSTRAINT "puzzle_completions_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "puzzle_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve completion history for databases that already contain progress.
INSERT INTO "puzzle_completions" (
  "id",
  "userId",
  "puzzleId",
  "completedAt",
  "timeTakenSec",
  "hintsUsed"
)
SELECT
  "id",
  "userId",
  "puzzleId",
  COALESCE("completedAt", "updatedAt"),
  COALESCE("timeTakenSec", 0),
  "hintsUsed"
FROM "user_puzzle_progress"
WHERE "status" = 'COMPLETED'
ON CONFLICT ("userId", "puzzleId") DO NOTHING;

-- Only operational flags may change after publication. Legacy metadata can make
-- a one-time transition after the publisher verifies that content is identical.
CREATE OR REPLACE FUNCTION prevent_published_puzzle_content_update()
RETURNS TRIGGER AS $$
BEGIN
  IF
    OLD."difficulty" IS DISTINCT FROM NEW."difficulty" OR
    OLD."inferenceSteps" IS DISTINCT FROM NEW."inferenceSteps" OR
    OLD."teamsConfig" IS DISTINCT FROM NEW."teamsConfig" OR
    OLD."standings" IS DISTINCT FROM NEW."standings" OR
    OLD."matchIds" IS DISTINCT FROM NEW."matchIds" OR
    OLD."solution" IS DISTINCT FROM NEW."solution" OR
    OLD."allSolutions" IS DISTINCT FROM NEW."allSolutions" OR
    OLD."dailyDate" IS DISTINCT FROM NEW."dailyDate" OR
    OLD."campaignOrder" IS DISTINCT FROM NEW."campaignOrder" OR
    OLD."campaignPack" IS DISTINCT FROM NEW."campaignPack" OR
    OLD."campaignLevel" IS DISTINCT FROM NEW."campaignLevel" OR
    OLD."tableDifficultyScore" IS DISTINCT FROM NEW."tableDifficultyScore" OR
    OLD."solutionCount" IS DISTINCT FROM NEW."solutionCount"
  THEN
    RAISE EXCEPTION 'Published puzzle content is immutable. Publish a new puzzle/version instead.';
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

CREATE TRIGGER "puzzles_immutable_content"
BEFORE UPDATE ON "puzzles"
FOR EACH ROW
EXECUTE FUNCTION prevent_published_puzzle_content_update();
