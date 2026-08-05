CREATE TYPE "AttemptKind" AS ENUM ('STANDARD', 'REPLAY');
CREATE TYPE "AttemptStatus" AS ENUM ('ACTIVE', 'SOLVED', 'REVEALED', 'ABANDONED');
CREATE TYPE "AttemptEventType" AS ENUM (
  'STARTED',
  'PROGRESS_SAVED',
  'HINT_USED',
  'ANSWER_REVEALED',
  'SUBMITTED',
  'COMPLETED',
  'ABANDONED'
);

CREATE TABLE "puzzle_attempts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "puzzleId" TEXT NOT NULL,
  "kind" "AttemptKind" NOT NULL,
  "status" "AttemptStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "elapsedTimeSec" INTEGER NOT NULL DEFAULT 0,
  "hintsUsed" INTEGER NOT NULL DEFAULT 0,
  "hintTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "answerRevealedAt" TIMESTAMP(3),
  "submissionCount" INTEGER NOT NULL DEFAULT 0,
  "currentState" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "puzzle_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attempt_events" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" "AttemptEventType" NOT NULL,
  "payload" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attempt_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "user_puzzle_progress"
  ADD COLUMN "currentAttemptId" TEXT,
  ADD COLUMN "firstAttemptId" TEXT,
  ADD COLUMN "bestAttemptId" TEXT;

ALTER TABLE "puzzle_submissions" ADD COLUMN "attemptId" TEXT;
ALTER TABLE "puzzle_completions" ADD COLUMN "attemptId" TEXT;

CREATE UNIQUE INDEX "user_puzzle_progress_currentAttemptId_key"
  ON "user_puzzle_progress"("currentAttemptId");
CREATE UNIQUE INDEX "user_puzzle_progress_firstAttemptId_key"
  ON "user_puzzle_progress"("firstAttemptId");
CREATE UNIQUE INDEX "user_puzzle_progress_bestAttemptId_key"
  ON "user_puzzle_progress"("bestAttemptId");
CREATE INDEX "puzzle_attempts_userId_puzzleId_startedAt_idx"
  ON "puzzle_attempts"("userId", "puzzleId", "startedAt");
CREATE INDEX "puzzle_attempts_userId_puzzleId_status_idx"
  ON "puzzle_attempts"("userId", "puzzleId", "status");
CREATE UNIQUE INDEX "attempt_events_attemptId_sequence_key"
  ON "attempt_events"("attemptId", "sequence");
CREATE INDEX "attempt_events_attemptId_occurredAt_idx"
  ON "attempt_events"("attemptId", "occurredAt");
CREATE INDEX "puzzle_submissions_attemptId_createdAt_idx"
  ON "puzzle_submissions"("attemptId", "createdAt");
CREATE UNIQUE INDEX "puzzle_completions_attemptId_key"
  ON "puzzle_completions"("attemptId");

ALTER TABLE "puzzle_attempts"
  ADD CONSTRAINT "puzzle_attempts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "puzzle_attempts"
  ADD CONSTRAINT "puzzle_attempts_puzzleId_fkey"
  FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempt_events"
  ADD CONSTRAINT "attempt_events_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "puzzle_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_puzzle_progress"
  ADD CONSTRAINT "user_puzzle_progress_currentAttemptId_fkey"
  FOREIGN KEY ("currentAttemptId") REFERENCES "puzzle_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_puzzle_progress"
  ADD CONSTRAINT "user_puzzle_progress_firstAttemptId_fkey"
  FOREIGN KEY ("firstAttemptId") REFERENCES "puzzle_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_puzzle_progress"
  ADD CONSTRAINT "user_puzzle_progress_bestAttemptId_fkey"
  FOREIGN KEY ("bestAttemptId") REFERENCES "puzzle_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "puzzle_submissions"
  ADD CONSTRAINT "puzzle_submissions_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "puzzle_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "puzzle_completions"
  ADD CONSTRAINT "puzzle_completions_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "puzzle_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
