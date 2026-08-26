ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'media_upload';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'media_delete';

ALTER TABLE "Media"
  ADD COLUMN "originalFileSize" INTEGER,
  ADD COLUMN "sha256" TEXT,
  ADD COLUMN "metadataRemoved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "removedMetadataKinds" JSONB;

CREATE TABLE "MediaDeletionJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "storageKey" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaDeletionJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaDeletionJob_storageKey_key" ON "MediaDeletionJob"("storageKey");
CREATE INDEX "MediaDeletionJob_createdAt_idx" ON "MediaDeletionJob"("createdAt");
