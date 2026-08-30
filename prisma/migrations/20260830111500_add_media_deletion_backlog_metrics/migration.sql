-- Privacy-safe operational visibility for the isolated deletion worker. The
-- function exposes only aggregate counters, never object keys or user/space IDs.
CREATE OR REPLACE FUNCTION safespace_worker.media_deletion_backlog_status()
RETURNS TABLE(
  pending_count bigint,
  due_count bigint,
  leased_count bigint,
  oldest_age_seconds bigint,
  max_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  now_utc timestamp := clock_timestamp() AT TIME ZONE 'UTC';
BEGIN
  PERFORM safespace_worker.require_media_deletion_worker();

  RETURN QUERY
  SELECT
    count(*)::bigint AS pending_count,
    count(*) FILTER (
      WHERE job."nextAttemptAt" <= now_utc
        AND (job."leaseExpiresAt" IS NULL OR job."leaseExpiresAt" <= now_utc)
    )::bigint AS due_count,
    count(*) FILTER (
      WHERE job."leaseExpiresAt" > now_utc
    )::bigint AS leased_count,
    COALESCE(
      GREATEST(
        0,
        floor(extract(epoch FROM (now_utc - min(job."createdAt"))))::bigint
      ),
      0
    ) AS oldest_age_seconds,
    COALESCE(max(job.attempts), 0)::integer AS max_attempts
  FROM public."MediaDeletionJob" job;
END;
$$;

REVOKE ALL ON FUNCTION safespace_worker.media_deletion_backlog_status() FROM PUBLIC;

COMMENT ON FUNCTION safespace_worker.media_deletion_backlog_status() IS
  'Returns deletion-outbox depth, due/leased counts, oldest age and max attempts without exposing identifiers.';

COMMENT ON SCHEMA safespace_worker IS
  'Dedicated deletion-worker interface. DBA grants only USAGE and EXECUTE on four bounded functions to safespace_media_deletion_worker.';
