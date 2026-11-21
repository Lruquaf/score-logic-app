-- Preserve deletion intent for delayed guest-bootstrap retries without retaining
-- user identifiers, raw installation credentials or encrypted auth responses.
CREATE TABLE "native_installation_tombstones" (
    "installationHash" VARCHAR(64) NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "native_installation_tombstones_pkey" PRIMARY KEY ("installationHash")
);

CREATE INDEX "native_installation_tombstones_expiresAt_idx"
    ON "native_installation_tombstones"("expiresAt");
