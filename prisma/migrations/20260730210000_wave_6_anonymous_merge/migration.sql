CREATE TABLE "anonymous_user_merges" (
  "sourceUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "affectedPuzzleCount" INTEGER NOT NULL DEFAULT 0,
  "movedAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "movedSubmissionCount" INTEGER NOT NULL DEFAULT 0,
  "mergedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "anonymous_user_merges_pkey" PRIMARY KEY ("sourceUserId")
);

CREATE INDEX "anonymous_user_merges_targetUserId_mergedAt_idx"
  ON "anonymous_user_merges"("targetUserId", "mergedAt");
