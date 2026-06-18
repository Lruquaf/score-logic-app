-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "PuzzleStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(5) NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameTr" TEXT,
    "flagEmoji" VARCHAR(10),
    "continent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puzzles" (
    "id" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "inferenceSteps" INTEGER NOT NULL,
    "teamsConfig" JSONB NOT NULL,
    "standings" JSONB NOT NULL,
    "matchIds" JSONB NOT NULL,
    "solution" JSONB NOT NULL,
    "dailyDate" DATE,
    "campaignOrder" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isTested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puzzles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_puzzle_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "status" "PuzzleStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "hintTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timeTakenSec" INTEGER,
    "currentState" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_puzzle_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_streaks" (
    "userId" TEXT NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedDate" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_streaks_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "user_stats" (
    "userId" TEXT NOT NULL,
    "totalSolved" INTEGER NOT NULL DEFAULT 0,
    "perfectSolves" INTEGER NOT NULL DEFAULT 0,
    "totalTimeSec" INTEGER NOT NULL DEFAULT 0,
    "solvedEasy" INTEGER NOT NULL DEFAULT 0,
    "solvedMedium" INTEGER NOT NULL DEFAULT 0,
    "solvedHard" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_code_key" ON "teams"("code");

-- CreateIndex
CREATE INDEX "teams_code_idx" ON "teams"("code");

-- CreateIndex
CREATE UNIQUE INDEX "puzzles_dailyDate_key" ON "puzzles"("dailyDate");

-- CreateIndex
CREATE UNIQUE INDEX "puzzles_campaignOrder_key" ON "puzzles"("campaignOrder");

-- CreateIndex
CREATE INDEX "puzzles_dailyDate_idx" ON "puzzles"("dailyDate");

-- CreateIndex
CREATE INDEX "puzzles_campaignOrder_idx" ON "puzzles"("campaignOrder");

-- CreateIndex
CREATE INDEX "puzzles_difficulty_idx" ON "puzzles"("difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_puzzle_progress_userId_status_idx" ON "user_puzzle_progress"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_puzzle_progress_userId_puzzleId_key" ON "user_puzzle_progress"("userId", "puzzleId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- AddForeignKey
ALTER TABLE "user_puzzle_progress" ADD CONSTRAINT "user_puzzle_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_puzzle_progress" ADD CONSTRAINT "user_puzzle_progress_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_streaks" ADD CONSTRAINT "daily_streaks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
