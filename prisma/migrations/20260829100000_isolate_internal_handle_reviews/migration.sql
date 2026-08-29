-- Fail closed before creating/copying anything.  The two earlier migrations
-- should already guarantee this shape, but an unexpectedly invalid production
-- row must stop deployment rather than be coerced, skipped or partially lost.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ReportedEntityHandle"
    WHERE "reviewStatus" NOT IN (
      'unreviewed', 'consistent', 'questionable', 'obsolete'
    )
      OR (
        "reviewStatus" = 'unreviewed'
        AND (
          "reviewNote" IS NOT NULL
          OR "reviewedAt" IS NOT NULL
          OR "reviewedByUserId" IS NOT NULL
        )
      )
      OR (
        "reviewStatus" <> 'unreviewed'
        AND (
          "reviewNote" IS NULL
          OR "reviewNote" IS DISTINCT FROM btrim("reviewNote")
          OR length("reviewNote") NOT BETWEEN 3 AND 500
          OR "reviewedAt" IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION
      'invalid legacy internal handle review; isolation migration aborted without changes';
  END IF;
END
$$;

-- Keep internal review evidence outside the member-readable handle row.  A
-- missing row means "unreviewed"; only completed internal reviews are stored.
CREATE TABLE "ReportedEntityHandleReview" (
  "reportedEntityHandleId" UUID NOT NULL,
  "reviewStatus" TEXT NOT NULL,
  "reviewNote" VARCHAR(500) NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedByUserId" UUID,

  CONSTRAINT "ReportedEntityHandleReview_pkey"
    PRIMARY KEY ("reportedEntityHandleId"),
  CONSTRAINT "ReportedEntityHandleReview_reviewStatus_check"
    CHECK ("reviewStatus" IN ('consistent', 'questionable', 'obsolete')),
  CONSTRAINT "ReportedEntityHandleReview_reviewNote_check"
    CHECK (
      "reviewNote" = btrim("reviewNote")
      AND length("reviewNote") BETWEEN 3 AND 500
    ),
  CONSTRAINT "ReportedEntityHandleReview_reportedEntityHandleId_fkey"
    FOREIGN KEY ("reportedEntityHandleId")
    REFERENCES "ReportedEntityHandle"(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportedEntityHandleReview_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId")
    REFERENCES "User"(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ReportedEntityHandleReview_reviewStatus_idx"
  ON "ReportedEntityHandleReview"("reviewStatus");
CREATE INDEX "ReportedEntityHandleReview_reviewedByUserId_idx"
  ON "ReportedEntityHandleReview"("reviewedByUserId");

-- Copy the existing evidence before removing the member-readable columns.
-- Unreviewed handles carry no review evidence and are represented by no row.
INSERT INTO "ReportedEntityHandleReview" (
  "reportedEntityHandleId",
  "reviewStatus",
  "reviewNote",
  "reviewedAt",
  "reviewedByUserId"
)
SELECT
  id,
  "reviewStatus",
  "reviewNote",
  "reviewedAt",
  "reviewedByUserId"
FROM "ReportedEntityHandle"
WHERE "reviewStatus" <> 'unreviewed';

DO $$
BEGIN
  IF (
    SELECT count(*) FROM "ReportedEntityHandle"
    WHERE "reviewStatus" <> 'unreviewed'
  ) <> (SELECT count(*) FROM "ReportedEntityHandleReview") THEN
    RAISE EXCEPTION 'internal handle review backfill was incomplete';
  END IF;
END
$$;

DROP TRIGGER reported_entity_handle_review_integrity
  ON "ReportedEntityHandle";
DROP FUNCTION safespace_private.enforce_reported_entity_handle_review();

DROP INDEX "ReportedEntityHandle_reviewStatus_idx";
DROP INDEX "ReportedEntityHandle_reviewedByUserId_idx";

ALTER TABLE "ReportedEntityHandle"
  DROP CONSTRAINT "ReportedEntityHandle_reviewStatus_check",
  DROP CONSTRAINT "ReportedEntityHandle_review_fields_check",
  DROP CONSTRAINT "ReportedEntityHandle_reviewedByUserId_fkey",
  DROP COLUMN "reviewStatus",
  DROP COLUMN "reviewNote",
  DROP COLUMN "reviewedAt",
  DROP COLUMN "reviewedByUserId";

-- Unlike the generic space helper, this predicate verifies the actor's current
-- database row instead of trusting the caller-provided super-admin flag.  It is
-- shared by review RLS and the stricter AuditLog policy below.
CREATE FUNCTION safespace_private.can_manage_internal_handle_review_space(
  target_space_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT safespace_private.context_mode() = 'user'
    AND target_space_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."User" actor
      WHERE actor.id = safespace_private.current_user_id()
        AND (
          actor."isSuperAdmin"
          OR (
            safespace_private.active_discipline_kind(
              target_space_id,
              actor.id
            ) IS NULL
            AND EXISTS (
              SELECT 1
              FROM public."UserSpaceMembership" membership
              WHERE membership."spaceId" = target_space_id
                AND membership."userId" = actor.id
                AND upper(replace(membership.role, '-', '_')) = 'ADMIN'
            )
          )
        )
    )
$$;

CREATE FUNCTION safespace_private.can_manage_reported_entity_handle_review(
  target_handle_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."ReportedEntityHandle" handle
    JOIN public."ReportedEntity" entity
      ON entity.id = handle."reportedEntityId"
    WHERE handle.id = target_handle_id
      AND safespace_private.can_manage_internal_handle_review_space(
        entity."spaceId"
      )
  )
$$;

ALTER TABLE "ReportedEntityHandleReview" ENABLE ROW LEVEL SECURITY;

CREATE POLICY reported_entity_handle_review_select
  ON "ReportedEntityHandleReview"
  FOR SELECT
  USING (
    safespace_private.can_manage_reported_entity_handle_review(
      "reportedEntityHandleId"
    )
  );

CREATE POLICY reported_entity_handle_review_insert
  ON "ReportedEntityHandleReview"
  FOR INSERT
  WITH CHECK (
    safespace_private.can_manage_reported_entity_handle_review(
      "reportedEntityHandleId"
    )
  );

CREATE POLICY reported_entity_handle_review_update
  ON "ReportedEntityHandleReview"
  FOR UPDATE
  USING (
    safespace_private.can_manage_reported_entity_handle_review(
      "reportedEntityHandleId"
    )
  )
  WITH CHECK (
    safespace_private.can_manage_reported_entity_handle_review(
      "reportedEntityHandleId"
    )
  );

CREATE POLICY reported_entity_handle_review_delete
  ON "ReportedEntityHandleReview"
  FOR DELETE
  USING (
    safespace_private.can_manage_reported_entity_handle_review(
      "reportedEntityHandleId"
    )
  );

-- Normal writers cannot choose provenance.  Referential SET NULL/CASCADE from
-- deleting or renaming a reviewer is the sole exception and preserves every
-- other byte of the review without pretending that another review happened.
CREATE FUNCTION safespace_private.normalize_reported_entity_handle_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW IS NOT DISTINCT FROM OLD
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW."reportedEntityHandleId" IS NOT DISTINCT FROM OLD."reportedEntityHandleId"
    AND NEW."reviewStatus" IS NOT DISTINCT FROM OLD."reviewStatus"
    AND NEW."reviewNote" IS NOT DISTINCT FROM OLD."reviewNote"
    AND NEW."reviewedAt" IS NOT DISTINCT FROM OLD."reviewedAt"
    AND NEW."reviewedByUserId" IS DISTINCT FROM OLD."reviewedByUserId"
    AND OLD."reviewedByUserId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public."User" WHERE id = OLD."reviewedByUserId"
    )
    AND (
      NEW."reviewedByUserId" IS NULL
      OR EXISTS (
        SELECT 1 FROM public."User" WHERE id = NEW."reviewedByUserId"
      )
    )
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW."reportedEntityHandleId" IS DISTINCT FROM OLD."reportedEntityHandleId"
  THEN
    RAISE EXCEPTION 'a handle review cannot be reassigned'
      USING ERRCODE = '42501';
  END IF;

  IF NOT safespace_private.can_manage_reported_entity_handle_review(
    NEW."reportedEntityHandleId"
  ) THEN
    RAISE EXCEPTION 'handle review requires a current space administrator'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."reviewStatus" NOT IN ('consistent', 'questionable', 'obsolete') THEN
    RAISE EXCEPTION 'invalid internal handle review status'
      USING ERRCODE = '22023';
  END IF;

  NEW."reviewNote" := btrim(NEW."reviewNote");
  IF NEW."reviewNote" IS NULL
    OR length(NEW."reviewNote") NOT BETWEEN 3 AND 500
  THEN
    RAISE EXCEPTION 'handle review note must contain between 3 and 500 characters'
      USING ERRCODE = '22023';
  END IF;

  NEW."reviewedByUserId" := safespace_private.current_user_id();
  NEW."reviewedAt" := date_trunc(
    'milliseconds',
    clock_timestamp() AT TIME ZONE 'UTC'
  );
  RETURN NEW;
END
$$;

CREATE TRIGGER reported_entity_handle_review_normalize
BEFORE INSERT OR UPDATE ON "ReportedEntityHandleReview"
FOR EACH ROW
EXECUTE FUNCTION safespace_private.normalize_reported_entity_handle_review();

-- Every real review-state mutation writes its audit in the same transaction.
-- A failure to write the audit therefore rolls the review back as well.
CREATE FUNCTION safespace_private.audit_reported_entity_handle_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor_id uuid := safespace_private.current_user_id();
  handle_id uuid := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."reportedEntityHandleId"
    ELSE NEW."reportedEntityHandleId"
  END;
  target_space_id uuid;
  resulting_status text := CASE
    WHEN TG_OP = 'DELETE' THEN 'unreviewed'
    ELSE NEW."reviewStatus"
  END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;

  -- ON DELETE SET NULL/ON UPDATE CASCADE on User only detaches identity.
  IF TG_OP = 'UPDATE'
    AND NEW."reportedEntityHandleId" IS NOT DISTINCT FROM OLD."reportedEntityHandleId"
    AND NEW."reviewStatus" IS NOT DISTINCT FROM OLD."reviewStatus"
    AND NEW."reviewNote" IS NOT DISTINCT FROM OLD."reviewNote"
    AND NEW."reviewedAt" IS NOT DISTINCT FROM OLD."reviewedAt"
    AND NEW."reviewedByUserId" IS DISTINCT FROM OLD."reviewedByUserId"
    AND OLD."reviewedByUserId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public."User" WHERE id = OLD."reviewedByUserId"
    )
    AND (
      NEW."reviewedByUserId" IS NULL
      OR EXISTS (
        SELECT 1 FROM public."User" WHERE id = NEW."reviewedByUserId"
      )
    )
  THEN
    RETURN NULL;
  END IF;

  -- A review removed by the handle's FK cascade is not a review reset.
  IF TG_OP = 'DELETE'
    AND NOT EXISTS (
      SELECT 1 FROM public."ReportedEntityHandle" WHERE id = handle_id
    )
  THEN
    RETURN NULL;
  END IF;

  SELECT entity."spaceId"
    INTO target_space_id
  FROM public."ReportedEntityHandle" handle
  JOIN public."ReportedEntity" entity
    ON entity.id = handle."reportedEntityId"
  WHERE handle.id = handle_id;

  IF actor_id IS NULL
    OR target_space_id IS NULL
    OR NOT safespace_private.can_manage_internal_handle_review_space(
      target_space_id
    )
  THEN
    RAISE EXCEPTION 'handle review audit requires a current space administrator'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public."AuditLog" (
    id,
    "actorUserId",
    action,
    "targetEntityType",
    "targetEntityId",
    "spaceId",
    details
  ) VALUES (
    gen_random_uuid(),
    actor_id,
    'entity_update'::public."AuditAction",
    'ReportedEntityHandle',
    handle_id,
    target_space_id,
    jsonb_build_object(
      'changedFields', jsonb_build_array('internalHandleReview'),
      'reviewStatus', resulting_status
    )
  );
  RETURN NULL;
END
$$;

CREATE TRIGGER reported_entity_handle_review_audit
AFTER INSERT OR UPDATE OR DELETE ON "ReportedEntityHandleReview"
FOR EACH ROW
EXECUTE FUNCTION safespace_private.audit_reported_entity_handle_review();

-- Review audit entries also carry internal state.  Preserve the general audit
-- policy for all other actions, but keep these entries admin-only even after a
-- reviewer loses their role.  This covers rows written before this migration.
DROP POLICY audit_log_select ON "AuditLog";
CREATE POLICY audit_log_select ON "AuditLog" FOR SELECT USING (
  CASE
    WHEN "targetEntityType" = 'ReportedEntityHandle'
      AND COALESCE((details -> 'changedFields') ? 'internalHandleReview', false)
    THEN
      "spaceId" IS NOT NULL
      AND safespace_private.can_manage_internal_handle_review_space("spaceId")
    ELSE
      safespace_private.is_superadmin()
      OR "actorUserId" = safespace_private.current_user_id()
      OR (
        "spaceId" IS NOT NULL
        AND safespace_private.has_elevated_space_role("spaceId")
      )
  END
);

COMMENT ON TABLE "ReportedEntityHandleReview" IS
  'Administrative SafeSpace review only; never proof of external account existence or ownership.';
COMMENT ON COLUMN "ReportedEntityHandleReview"."reviewedAt" IS
  'Database-generated UTC time of the latest internal review change.';
COMMENT ON COLUMN "ReportedEntityHandleReview"."reviewedByUserId" IS
  'Database-derived current reviewer; nullable only after account deletion.';

REVOKE ALL ON FUNCTION
  safespace_private.normalize_reported_entity_handle_review()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  safespace_private.audit_reported_entity_handle_review()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  safespace_private.can_manage_internal_handle_review_space(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  safespace_private.can_manage_reported_entity_handle_review(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  safespace_private.can_manage_internal_handle_review_space(uuid)
  TO PUBLIC;
GRANT EXECUTE ON FUNCTION
  safespace_private.can_manage_reported_entity_handle_review(uuid)
  TO PUBLIC;
