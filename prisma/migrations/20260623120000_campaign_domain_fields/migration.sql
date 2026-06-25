-- CreateEnum
CREATE TYPE "CampaignPack" AS ENUM ('BEGINNER', 'EASY', 'MEDIUM', 'HARD', 'EXPERT');

-- AlterTable
ALTER TABLE "puzzles"
ADD COLUMN "campaignPack" "CampaignPack",
ADD COLUMN "campaignLevel" INTEGER,
ADD COLUMN "tableDifficultyScore" INTEGER,
ADD COLUMN "solutionCount" INTEGER;

-- AlterTable
ALTER TABLE "user_puzzle_progress"
ADD COLUMN "answerRevealed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "answerRevealedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "puzzles_campaignPack_campaignLevel_idx" ON "puzzles"("campaignPack", "campaignLevel");

-- CreateIndex
CREATE INDEX "puzzles_tableDifficultyScore_idx" ON "puzzles"("tableDifficultyScore");
