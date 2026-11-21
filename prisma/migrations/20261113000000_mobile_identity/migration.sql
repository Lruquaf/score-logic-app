-- AlterTable
ALTER TABLE "user_puzzle_progress" ADD COLUMN     "requiresRevision" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "puzzle_commands" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadHash" VARCHAR(64) NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puzzle_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "native_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "subjectUserId" TEXT NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL,
    "refreshTokenHash" VARCHAR(64) NOT NULL,
    "installationHash" VARCHAR(64),
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "native_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "native_auth_receipts" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "previousTokenHash" VARCHAR(64),
    "sessionId" TEXT NOT NULL,
    "responseCiphertext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "native_auth_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "puzzle_commands_userId_puzzleId_createdAt_idx" ON "puzzle_commands"("userId", "puzzleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "puzzle_commands_userId_commandId_key" ON "puzzle_commands"("userId", "commandId");

-- CreateIndex
CREATE UNIQUE INDEX "native_sessions_refreshTokenHash_key" ON "native_sessions"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "native_sessions_installationHash_key" ON "native_sessions"("installationHash");

-- CreateIndex
CREATE INDEX "native_sessions_userId_revokedAt_idx" ON "native_sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "native_sessions_subjectUserId_idx" ON "native_sessions"("subjectUserId");

-- CreateIndex
CREATE INDEX "native_sessions_refreshExpiresAt_idx" ON "native_sessions"("refreshExpiresAt");

-- CreateIndex
CREATE INDEX "native_auth_receipts_previousTokenHash_idx" ON "native_auth_receipts"("previousTokenHash");

-- CreateIndex
CREATE INDEX "native_auth_receipts_expiresAt_idx" ON "native_auth_receipts"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "native_auth_receipts_scope_commandId_key" ON "native_auth_receipts"("scope", "commandId");

-- AddForeignKey
ALTER TABLE "puzzle_commands" ADD CONSTRAINT "puzzle_commands_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_commands" ADD CONSTRAINT "puzzle_commands_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "puzzles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_sessions" ADD CONSTRAINT "native_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_auth_receipts" ADD CONSTRAINT "native_auth_receipts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "native_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

