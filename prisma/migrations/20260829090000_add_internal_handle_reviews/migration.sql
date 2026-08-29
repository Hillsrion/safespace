ALTER TABLE "ReportedEntityHandle"
  ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN "reviewNote" VARCHAR(500),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByUserId" UUID;

ALTER TABLE "ReportedEntityHandle"
  ADD CONSTRAINT "ReportedEntityHandle_reviewStatus_check"
    CHECK ("reviewStatus" IN ('unreviewed', 'consistent', 'questionable', 'obsolete')),
  ADD CONSTRAINT "ReportedEntityHandle_review_fields_check"
    CHECK (
      ("reviewStatus" = 'unreviewed' AND "reviewNote" IS NULL AND "reviewedAt" IS NULL)
      OR
      ("reviewStatus" <> 'unreviewed' AND length(btrim("reviewNote")) BETWEEN 3 AND 500 AND "reviewedAt" IS NOT NULL)
    ),
  ADD CONSTRAINT "ReportedEntityHandle_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ReportedEntityHandle_reviewStatus_idx" ON "ReportedEntityHandle"("reviewStatus");
CREATE INDEX "ReportedEntityHandle_reviewedByUserId_idx" ON "ReportedEntityHandle"("reviewedByUserId");

COMMENT ON COLUMN "ReportedEntityHandle"."reviewStatus" IS
  'Internal SafeSpace review only; never proof of external account existence or ownership.';
