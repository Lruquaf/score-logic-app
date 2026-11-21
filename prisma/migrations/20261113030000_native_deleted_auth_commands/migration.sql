-- Prevent a delayed old registration command from recreating a deleted account.
-- The salted command digest contains no email, user id, password or token.
CREATE TABLE "native_deleted_auth_commands" (
    "commandHash" VARCHAR(64) NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "native_deleted_auth_commands_pkey" PRIMARY KEY ("commandHash")
);

CREATE INDEX "native_deleted_auth_commands_expiresAt_idx"
    ON "native_deleted_auth_commands"("expiresAt");

-- Preserve the channel boundary if a prior native-session release was installed
-- before the marker migration. Normal legacy web guests remain compatible.
UPDATE "users" AS u
SET "nativeGuest" = true
WHERE u."isAnonymous" = true
AND EXISTS (
    SELECT 1 FROM "native_sessions" AS s
    WHERE s."subjectUserId" = u."id" AND s."isAnonymous" = true
);
