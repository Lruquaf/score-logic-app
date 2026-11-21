CREATE TABLE "native_deletion_receipts" (
    "commandId" UUID NOT NULL,
    "capabilityHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "native_deletion_receipts_pkey" PRIMARY KEY ("commandId")
);
CREATE INDEX "native_deletion_receipts_expiresAt_idx" ON "native_deletion_receipts"("expiresAt");
