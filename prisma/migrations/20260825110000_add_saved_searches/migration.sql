CREATE TABLE "SavedSearch" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'all',
  "spaceId" UUID,
  "severity" "PostSeverity",
  "verificationStatus" "PostVerificationStatus",
  "alertEnabled" BOOLEAN NOT NULL DEFAULT false,
  "alertHandle" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "SavedSearch_userId_updatedAt_idx" ON "SavedSearch"("userId", "updatedAt");
CREATE INDEX "SavedSearch_spaceId_idx" ON "SavedSearch"("spaceId");
