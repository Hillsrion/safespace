-- The deletion worker is intentionally unable to use application RLS helpers.
-- Those helpers derive identity from safespace.user_id, which an untrusted
-- background connection could otherwise forge with SET.  The worker receives
-- only three fixed SECURITY DEFINER operations in its own schema.
REVOKE USAGE ON SCHEMA safespace_private FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA safespace_private FROM PUBLIC;

CREATE SCHEMA IF NOT EXISTS safespace_worker;
REVOKE ALL ON SCHEMA safespace_worker FROM PUBLIC;

ALTER TABLE public."MediaDeletionJob"
  ADD COLUMN "leaseToken" UUID,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC');

CREATE INDEX "MediaDeletionJob_pending_lease_idx"
  ON public."MediaDeletionJob"("nextAttemptAt", "leaseExpiresAt", "attempts", "createdAt");

CREATE OR REPLACE FUNCTION safespace_worker.require_media_deletion_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  -- session_user cannot be changed with SET ROLE, unlike current_user.
  IF session_user <> 'safespace_media_deletion_worker' THEN
    RAISE EXCEPTION 'media deletion worker role required' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION safespace_worker.claim_media_deletion_jobs(p_limit integer)
RETURNS TABLE(job_id uuid, storage_key text, lease_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM safespace_worker.require_media_deletion_worker();
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'media deletion batch size must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public."MediaDeletionJob"
    WHERE "nextAttemptAt" <= (clock_timestamp() AT TIME ZONE 'UTC')
      AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC'))
      AND NOT EXISTS (
        SELECT 1 FROM public."Media" media WHERE media."storageKey" = "MediaDeletionJob"."storageKey"
      )
    ORDER BY attempts ASC, "createdAt" ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public."MediaDeletionJob" AS job
  SET "leaseToken" = gen_random_uuid(),
      "leaseExpiresAt" = (clock_timestamp() AT TIME ZONE 'UTC') + interval '3 minutes'
  FROM candidates
  WHERE job.id = candidates.id
  RETURNING job.id, job."storageKey", job."leaseToken";
END;
$$;

CREATE OR REPLACE FUNCTION safespace_worker.complete_media_deletion_job(p_job_id uuid, p_lease_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM safespace_worker.require_media_deletion_worker();
  DELETE FROM public."MediaDeletionJob"
  WHERE id = p_job_id AND "leaseToken" = p_lease_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION safespace_worker.fail_media_deletion_job(
  p_job_id uuid, p_lease_token uuid, p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM safespace_worker.require_media_deletion_worker();
  IF p_error_code IS NULL OR p_error_code NOT IN ('storage_configuration', 'storage_timeout', 'storage_request_failed') THEN
    RAISE EXCEPTION 'invalid media deletion error code' USING ERRCODE = '22023';
  END IF;

  UPDATE public."MediaDeletionJob"
  SET attempts = attempts + 1,
      "lastAttemptAt" = (clock_timestamp() AT TIME ZONE 'UTC'),
      "lastError" = p_error_code,
      "nextAttemptAt" = (clock_timestamp() AT TIME ZONE 'UTC')
        + make_interval(secs => 30 * (2 ^ LEAST(attempts, 8))::integer),
      "leaseToken" = NULL,
      "leaseExpiresAt" = NULL
  WHERE id = p_job_id AND "leaseToken" = p_lease_token;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA safespace_worker FROM PUBLIC;

COMMENT ON SCHEMA safespace_worker IS
  'Dedicated deletion-worker interface. DBA grants only USAGE and EXECUTE on its three public functions to safespace_media_deletion_worker.';
COMMENT ON FUNCTION safespace_worker.claim_media_deletion_jobs(integer) IS
  'Leases a bounded deletion batch without exposing application tables to the worker role.';
