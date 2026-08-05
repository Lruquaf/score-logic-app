-- Wave 15: persist reproducible observed-difficulty snapshots without mutating
-- immutable publication difficulty metadata.
CREATE TYPE "DifficultyCalibrationStatus" AS ENUM (
  'INSUFFICIENT_DATA',
  'ALIGNED',
  'UNDER_ESTIMATED',
  'OVER_ESTIMATED'
);

CREATE TABLE "difficulty_calibration_runs" (
  "id" TEXT NOT NULL,
  "algorithmVersion" VARCHAR(64) NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "windowDays" INTEGER NOT NULL,
  "minimumSampleSize" INTEGER NOT NULL,
  "staleAttemptHours" INTEGER NOT NULL,
  "puzzleCount" INTEGER NOT NULL,
  "eligiblePuzzleCount" INTEGER NOT NULL,
  "terminalAttemptCount" INTEGER NOT NULL,
  "driftedPuzzleCount" INTEGER NOT NULL,
  "meanAbsoluteError" DOUBLE PRECISION,
  "signedBias" DOUBLE PRECISION,
  "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "difficulty_calibration_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "difficulty_calibration_runs_window"
    CHECK ("windowStart" < "windowEnd" AND "windowDays" BETWEEN 1 AND 365),
  CONSTRAINT "difficulty_calibration_runs_policy"
    CHECK ("minimumSampleSize" BETWEEN 1 AND 10000 AND "staleAttemptHours" BETWEEN 1 AND 168),
  CONSTRAINT "difficulty_calibration_runs_counts"
    CHECK (
      "puzzleCount" >= 0 AND
      "eligiblePuzzleCount" BETWEEN 0 AND "puzzleCount" AND
      "terminalAttemptCount" >= 0 AND
      "driftedPuzzleCount" BETWEEN 0 AND "eligiblePuzzleCount"
    ),
  CONSTRAINT "difficulty_calibration_runs_error_summary"
    CHECK (
      ("eligiblePuzzleCount" = 0 AND "meanAbsoluteError" IS NULL AND "signedBias" IS NULL) OR
      ("eligiblePuzzleCount" > 0 AND "meanAbsoluteError" >= 0 AND "signedBias" IS NOT NULL)
    )
);

CREATE TABLE "puzzle_difficulty_observations" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "puzzleId" TEXT NOT NULL,
  "contentKey" TEXT NOT NULL,
  "contentRevision" INTEGER NOT NULL,
  "predictedDifficultyScore" INTEGER NOT NULL,
  "observedDifficultyScore" INTEGER,
  "observedDifficulty" "Difficulty",
  "calibrationStatus" "DifficultyCalibrationStatus" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "distinctUserCount" INTEGER NOT NULL,
  "terminalAttemptCount" INTEGER NOT NULL,
  "solvedAttemptCount" INTEGER NOT NULL,
  "revealedAttemptCount" INTEGER NOT NULL,
  "abandonedAttemptCount" INTEGER NOT NULL,
  "staleAttemptCount" INTEGER NOT NULL,
  "activeAttemptCount" INTEGER NOT NULL,
  "hintedAttemptCount" INTEGER NOT NULL,
  "firstTrySolveCount" INTEGER NOT NULL,
  "totalSubmissionCount" INTEGER NOT NULL,
  "completionRate" DOUBLE PRECISION,
  "revealRate" DOUBLE PRECISION,
  "abandonmentRate" DOUBLE PRECISION,
  "hintRate" DOUBLE PRECISION,
  "firstTrySolveRate" DOUBLE PRECISION,
  "averageSubmissionCount" DOUBLE PRECISION,
  "medianSolveTimeSec" INTEGER,
  "p75SolveTimeSec" INTEGER,
  "scoreDelta" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "puzzle_difficulty_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "puzzle_difficulty_observations_counts"
    CHECK (
      "contentRevision" >= 1 AND
      "predictedDifficultyScore" >= 1 AND
      "distinctUserCount" BETWEEN 0 AND "terminalAttemptCount" AND
      "terminalAttemptCount" = "solvedAttemptCount" + "revealedAttemptCount" + "abandonedAttemptCount" AND
      "staleAttemptCount" BETWEEN 0 AND "abandonedAttemptCount" AND
      "activeAttemptCount" >= 0 AND
      "hintedAttemptCount" BETWEEN 0 AND "terminalAttemptCount" AND
      "firstTrySolveCount" BETWEEN 0 AND "solvedAttemptCount" AND
      "totalSubmissionCount" >= 0
    ),
  CONSTRAINT "puzzle_difficulty_observations_confidence"
    CHECK ("confidence" BETWEEN 0 AND 1),
  CONSTRAINT "puzzle_difficulty_observations_rates"
    CHECK (
      (
        "terminalAttemptCount" = 0 AND
        "completionRate" IS NULL AND
        "revealRate" IS NULL AND
        "abandonmentRate" IS NULL AND
        "hintRate" IS NULL AND
        "averageSubmissionCount" IS NULL AND
        "observedDifficultyScore" IS NULL AND
        "observedDifficulty" IS NULL AND
        "scoreDelta" IS NULL
      ) OR (
        "terminalAttemptCount" > 0 AND
        "completionRate" BETWEEN 0 AND 1 AND
        "revealRate" BETWEEN 0 AND 1 AND
        "abandonmentRate" BETWEEN 0 AND 1 AND
        "hintRate" BETWEEN 0 AND 1 AND
        "averageSubmissionCount" >= 0 AND
        "observedDifficultyScore" BETWEEN 1 AND 100 AND
        "observedDifficulty" IS NOT NULL AND
        "scoreDelta" = "observedDifficultyScore" - "predictedDifficultyScore"
      )
    ),
  CONSTRAINT "puzzle_difficulty_observations_first_try_rate"
    CHECK (
      ("solvedAttemptCount" = 0 AND "firstTrySolveRate" IS NULL) OR
      ("solvedAttemptCount" > 0 AND "firstTrySolveRate" BETWEEN 0 AND 1)
    ),
  CONSTRAINT "puzzle_difficulty_observations_solve_time"
    CHECK (
      ("solvedAttemptCount" = 0 AND "medianSolveTimeSec" IS NULL AND "p75SolveTimeSec" IS NULL) OR
      (
        "solvedAttemptCount" > 0 AND
        "medianSolveTimeSec" BETWEEN 0 AND 7200 AND
        "p75SolveTimeSec" BETWEEN "medianSolveTimeSec" AND 7200
      )
    ),
  CONSTRAINT "puzzle_difficulty_observations_classification"
    CHECK (
      "observedDifficultyScore" IS NULL OR
      ("observedDifficultyScore" <= 30 AND "observedDifficulty" = 'EASY') OR
      ("observedDifficultyScore" BETWEEN 31 AND 42 AND "observedDifficulty" = 'MEDIUM') OR
      ("observedDifficultyScore" >= 43 AND "observedDifficulty" = 'HARD')
    )
);

CREATE UNIQUE INDEX "difficulty_calibration_runs_window_key"
  ON "difficulty_calibration_runs"(
    "algorithmVersion", "windowStart", "windowEnd", "minimumSampleSize", "staleAttemptHours"
  );
CREATE INDEX "difficulty_calibration_runs_windowEnd_createdAt_idx"
  ON "difficulty_calibration_runs"("windowEnd", "createdAt");
CREATE UNIQUE INDEX "puzzle_difficulty_observations_runId_puzzleId_key"
  ON "puzzle_difficulty_observations"("runId", "puzzleId");
CREATE INDEX "puzzle_difficulty_observations_puzzleId_createdAt_idx"
  ON "puzzle_difficulty_observations"("puzzleId", "createdAt");
CREATE INDEX "puzzle_difficulty_observations_calibrationStatus_confidence_idx"
  ON "puzzle_difficulty_observations"("calibrationStatus", "confidence");
CREATE INDEX "puzzle_difficulty_observations_contentKey_contentRevision_createdAt_idx"
  ON "puzzle_difficulty_observations"("contentKey", "contentRevision", "createdAt");

ALTER TABLE "puzzle_difficulty_observations"
  ADD CONSTRAINT "puzzle_difficulty_observations_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "difficulty_calibration_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "puzzle_difficulty_observations_puzzleId_fkey"
  FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
