-- The outbox deliberately keeps no foreign keys: account/space deletion must
-- not erase the only durable record of an object that still needs removal.
-- Nullable ownership preserves any rows created before this migration; those
-- legacy rows are visible only to the privileged system worker.
ALTER TABLE "MediaDeletionJob"
  ADD COLUMN "requestedByUserId" UUID,
  ADD COLUMN "spaceId" UUID;

CREATE INDEX "MediaDeletionJob_requestedByUserId_idx"
  ON "MediaDeletionJob"("requestedByUserId");
CREATE INDEX "MediaDeletionJob_spaceId_idx"
  ON "MediaDeletionJob"("spaceId");

ALTER TABLE "MediaDeletionJob" ENABLE ROW LEVEL SECURITY;

CREATE POLICY media_deletion_job_select ON "MediaDeletionJob" FOR SELECT USING (
  safespace_private.is_superadmin()
  OR "requestedByUserId" = safespace_private.current_user_id()
);
CREATE POLICY media_deletion_job_insert ON "MediaDeletionJob" FOR INSERT WITH CHECK (
  safespace_private.is_superadmin()
  OR (
    "requestedByUserId" = safespace_private.current_user_id()
    AND "spaceId" IS NOT NULL
    AND safespace_private.is_space_member("spaceId")
  )
);
CREATE POLICY media_deletion_job_update ON "MediaDeletionJob" FOR UPDATE
  USING (
    safespace_private.is_superadmin()
    OR "requestedByUserId" = safespace_private.current_user_id()
  )
  WITH CHECK (
    safespace_private.is_superadmin()
    OR "requestedByUserId" = safespace_private.current_user_id()
  );
CREATE POLICY media_deletion_job_delete ON "MediaDeletionJob" FOR DELETE USING (
  safespace_private.is_superadmin()
  OR "requestedByUserId" = safespace_private.current_user_id()
);

COMMENT ON TABLE "MediaDeletionJob" IS
  'Durable object-deletion outbox. Web access is scoped to the requesting user; scheduled retries require SYSTEM_DATABASE_URL.';
