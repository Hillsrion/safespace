-- Internal handle-review provenance is database-managed.  The application
-- still performs the product-level authorization and audit write, while this
-- trigger prevents a permitted handle writer from forging the reviewer or the
-- review time through a direct/model update.

ALTER TABLE "ReportedEntityHandle"
  DROP CONSTRAINT "ReportedEntityHandle_review_fields_check";

-- Close the only state that the previous constraint left ambiguous.  Existing
-- reviewed rows are preserved: a NULL reviewer is legitimate after the
-- referenced account has been deleted through ON DELETE SET NULL.
UPDATE "ReportedEntityHandle"
SET "reviewedByUserId" = NULL
WHERE "reviewStatus" = 'unreviewed'
  AND "reviewedByUserId" IS NOT NULL;

UPDATE "ReportedEntityHandle"
SET "reviewNote" = btrim("reviewNote")
WHERE "reviewStatus" <> 'unreviewed'
  AND "reviewNote" IS DISTINCT FROM btrim("reviewNote");

ALTER TABLE "ReportedEntityHandle"
  ADD CONSTRAINT "ReportedEntityHandle_review_fields_check"
    CHECK (
      (
        "reviewStatus" = 'unreviewed'
        AND "reviewNote" IS NULL
        AND "reviewedAt" IS NULL
        AND "reviewedByUserId" IS NULL
      )
      OR
      (
        "reviewStatus" <> 'unreviewed'
        AND "reviewNote" IS NOT NULL
        AND length(btrim("reviewNote")) BETWEEN 3 AND 500
        AND "reviewedAt" IS NOT NULL
      )
    );

CREATE FUNCTION safespace_private.enforce_reported_entity_handle_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor_id uuid;
  target_space_id uuid;
BEGIN
  -- A handle is always born unreviewed.  Editors may legitimately add handles,
  -- but they cannot smuggle a completed review through the INSERT policy.
  IF TG_OP = 'INSERT' THEN
    NEW."reviewStatus" := 'unreviewed';
    NEW."reviewNote" := NULL;
    NEW."reviewedAt" := NULL;
    NEW."reviewedByUserId" := NULL;
    RETURN NEW;
  END IF;

  IF ROW(NEW."reviewStatus", NEW."reviewNote", NEW."reviewedAt", NEW."reviewedByUserId")
    IS NOT DISTINCT FROM
    ROW(OLD."reviewStatus", OLD."reviewNote", OLD."reviewedAt", OLD."reviewedByUserId")
  THEN
    RETURN NEW;
  END IF;

  -- Preserve referential actions without opening a reassignment primitive.
  -- During ON DELETE SET NULL (or ON UPDATE CASCADE), the old User identity no
  -- longer exists when this row trigger runs.  All review evidence other than
  -- the foreign-key identity must remain byte-for-byte unchanged.
  IF NEW."reviewStatus" IS NOT DISTINCT FROM OLD."reviewStatus"
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

  actor_id := safespace_private.current_user_id();
  SELECT entity."spaceId"
    INTO target_space_id
  FROM public."ReportedEntity" entity
  WHERE entity.id = OLD."reportedEntityId";

  IF safespace_private.context_mode() <> 'user'
    OR actor_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public."User" WHERE id = actor_id)
    OR target_space_id IS NULL
    OR NOT safespace_private.is_space_admin(target_space_id)
  THEN
    RAISE EXCEPTION 'handle review requires a current space administrator'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."reviewStatus" = 'unreviewed' THEN
    NEW."reviewNote" := NULL;
    NEW."reviewedAt" := NULL;
    NEW."reviewedByUserId" := NULL;
    RETURN NEW;
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

  NEW."reviewedByUserId" := actor_id;
  NEW."reviewedAt" := date_trunc(
    'milliseconds',
    clock_timestamp() AT TIME ZONE 'UTC'
  );
  RETURN NEW;
END
$$;

CREATE TRIGGER reported_entity_handle_review_integrity
BEFORE INSERT OR UPDATE ON "ReportedEntityHandle"
FOR EACH ROW
EXECUTE FUNCTION safespace_private.enforce_reported_entity_handle_review();

COMMENT ON COLUMN "ReportedEntityHandle"."reviewedAt" IS
  'Database-generated UTC time of the latest internal review change.';
COMMENT ON COLUMN "ReportedEntityHandle"."reviewedByUserId" IS
  'Database-derived current reviewer; nullable only before review or after account deletion.';
