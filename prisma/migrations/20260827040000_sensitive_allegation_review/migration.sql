-- Three independent internal reviews, not a finding of legal truth. Visibility
-- remains governed by the existing Post policies. Only the migration owner / an
-- explicitly privileged system role may bypass the immutable workflow tables.
CREATE TYPE "SensitiveReviewStatus" AS ENUM ('pending', 'changes_requested', 'approved', 'superseded', 'blocked');
CREATE TYPE "SensitiveReviewOutcome" AS ENUM ('approve', 'request_changes');
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'sensitive_review_require';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'sensitive_review_decide';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'sensitive_review_invalidate';

ALTER TABLE "Post" ADD COLUMN "requiresSensitiveReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contentRevision" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "Post_contentRevision_check" CHECK ("contentRevision" > 0);

CREATE TABLE "SensitiveReviewRound" (
  id UUID PRIMARY KEY,
  "postId" UUID NOT NULL REFERENCES "Post"(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  status "SensitiveReviewStatus" NOT NULL DEFAULT 'pending',
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SensitiveReviewRound_postId_revision_key" UNIQUE ("postId", revision)
);
CREATE INDEX "SensitiveReviewRound_status_createdAt_idx" ON "SensitiveReviewRound" (status, "createdAt");
CREATE TABLE "SensitiveReviewDecision" (
  id UUID PRIMARY KEY,
  "roundId" UUID NOT NULL REFERENCES "SensitiveReviewRound"(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 3),
  "reviewerUserId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  outcome "SensitiveReviewOutcome" NOT NULL,
  note TEXT NOT NULL CHECK (length(btrim(note)) BETWEEN 10 AND 2000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SensitiveReviewDecision_roundId_stage_key" UNIQUE ("roundId", stage),
  CONSTRAINT "SensitiveReviewDecision_roundId_reviewerUserId_key" UNIQUE ("roundId", "reviewerUserId")
);

-- Prisma DateTime values are UTC in TIMESTAMP WITHOUT TIME ZONE columns.
-- Compare like-for-like: a non-UTC PostgreSQL session must not prematurely
-- expire a short restriction and thereby grant a review decision.
CREATE OR REPLACE FUNCTION safespace_private.active_discipline_kind(target_space_id uuid, target_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT action.kind::text FROM public."DisciplinaryAction" action
  WHERE action."spaceId" = target_space_id AND action."userId" = target_user_id
    AND action.status = 'active' AND action.kind IN ('restriction', 'suspension')
    AND (action."expiresAt" IS NULL OR action."expiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
  ORDER BY CASE action.kind WHEN 'suspension' THEN 2 ELSE 1 END DESC,
    action.level DESC, action."createdAt" DESC LIMIT 1
$$;

-- Existing serious reports require a new review, never a retroactive approval.
UPDATE "Post" SET "requiresSensitiveReview" = true,
  "verificationStatus" = 'pending' WHERE severity = 'high';
INSERT INTO "SensitiveReviewRound" (id, "postId", revision, status, reason)
SELECT gen_random_uuid(), id, "contentRevision",
  CASE WHEN "authorId" IS NULL THEN 'blocked' ELSE 'pending' END::"SensitiveReviewStatus",
  'High sensitivity requires three independent internal reviews.'
FROM "Post" WHERE "requiresSensitiveReview";

CREATE FUNCTION safespace_private.can_read_sensitive_review(target_post_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT safespace_private.context_mode() = 'user'
    AND EXISTS (SELECT 1 FROM public."Post" p
      JOIN public."User" u ON u.id = safespace_private.current_user_id()
      WHERE p.id = target_post_id
        AND safespace_private.can_read_post(p.id)
        AND safespace_private.has_elevated_space_role(p."spaceId")
        AND safespace_private.active_discipline_kind(p."spaceId", u.id) IS NULL)
$$;

ALTER TABLE "SensitiveReviewRound" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SensitiveReviewDecision" ENABLE ROW LEVEL SECURITY;
CREATE POLICY sensitive_review_round_select ON "SensitiveReviewRound" FOR SELECT
  USING (safespace_private.can_read_sensitive_review("postId"));
CREATE POLICY sensitive_review_decision_select ON "SensitiveReviewDecision" FOR SELECT
  USING (EXISTS (SELECT 1 FROM public."SensitiveReviewRound" r WHERE r.id = "roundId"));
-- Intentionally no INSERT/UPDATE/DELETE policy, even for application superadmins.
-- All mutations use the narrowly scoped SECURITY DEFINER operations below.

CREATE FUNCTION safespace_private.sensitive_review_complete(target_post_id uuid, target_revision integer, author_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT author_id IS NOT NULL AND safespace_private.can_read_post(target_post_id) AND EXISTS (
    SELECT 1 FROM public."SensitiveReviewRound" r
    JOIN public."SensitiveReviewDecision" d ON d."roundId" = r.id
    WHERE r."postId" = target_post_id AND r.revision = target_revision AND r.status = 'approved'
    GROUP BY r.id
    HAVING count(*) = 3 AND count(DISTINCT d."reviewerUserId") = 3
      AND bool_and(d.outcome = 'approve' AND d."reviewerUserId" <> author_id)
  )
$$;

-- SECURITY INVOKER is deliberate: only owner-operated, self-scoped functions
-- can explicitly advance a revision for evidence edits or classify manually.
-- A caller-supplied SET LOCAL flag would be forgeable and is never trusted.
CREATE FUNCTION safespace_private.guard_sensitive_post()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  owner_operation boolean := current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID));
  changed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."contentRevision" := 1;
    IF NEW."requiresSensitiveReview" AND NEW.severity IS DISTINCT FROM 'high' AND NOT owner_operation THEN
      RAISE EXCEPTION 'manual review requires a motivated classification' USING ERRCODE = '42501';
    END IF;
    NEW."requiresSensitiveReview" := NEW."requiresSensitiveReview" OR NEW.severity = 'high';
    NEW."requiresSensitiveReview" := COALESCE(NEW."requiresSensitiveReview", false);
  ELSE
    IF NEW.id <> OLD.id OR NEW."spaceId" <> OLD."spaceId"
      OR (NEW."authorId" IS DISTINCT FROM OLD."authorId" AND (NEW."authorId" IS NOT NULL OR NOT owner_operation))
    THEN
      RAISE EXCEPTION 'report scope and authorship cannot be reassigned' USING ERRCODE = '42501';
    END IF;
    IF NEW."contentRevision" <> OLD."contentRevision" AND NOT owner_operation THEN
      RAISE EXCEPTION 'report revision is managed by the review workflow' USING ERRCODE = '42501';
    END IF;
    IF NOT OLD."requiresSensitiveReview" AND NEW."requiresSensitiveReview"
      AND NEW.severity IS DISTINCT FROM 'high' AND NOT owner_operation
    THEN
      RAISE EXCEPTION 'manual review requires a motivated classification' USING ERRCODE = '42501';
    END IF;
    NEW."requiresSensitiveReview" := OLD."requiresSensitiveReview" OR NEW."requiresSensitiveReview"
      OR COALESCE(NEW.severity = 'high', false);
    changed := ROW(NEW.description, NEW."reportedEntityId", NEW.severity, NEW."isAnonymous", NEW."isAdminOnly", NEW."authorId")
      IS DISTINCT FROM ROW(OLD.description, OLD."reportedEntityId", OLD.severity, OLD."isAnonymous", OLD."isAdminOnly", OLD."authorId")
      OR NEW."contentRevision" <> OLD."contentRevision"
      OR NEW."requiresSensitiveReview" <> OLD."requiresSensitiveReview";
    NEW."contentRevision" := OLD."contentRevision" + CASE WHEN changed THEN 1 ELSE 0 END;
    IF changed AND NEW."requiresSensitiveReview" THEN
      NEW."verificationStatus" := 'pending';
    END IF;
  END IF;
  IF NEW."requiresSensitiveReview" AND NEW."verificationStatus" = 'verified'
    AND NOT safespace_private.sensitive_review_complete(NEW.id, NEW."contentRevision", NEW."authorId")
  THEN
    RAISE EXCEPTION 'three independent reviews of this revision are required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND NEW."requiresSensitiveReview" THEN NEW."verificationStatus" := 'pending'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER post_sensitive_guard BEFORE INSERT OR UPDATE ON "Post"
FOR EACH ROW EXECUTE FUNCTION safespace_private.guard_sensitive_post();

CREATE FUNCTION safespace_private.open_sensitive_review_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  actor_id uuid := safespace_private.current_user_id();
BEGIN
  IF NOT NEW."requiresSensitiveReview" THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW."contentRevision" = OLD."contentRevision" THEN RETURN NEW; END IF;
  UPDATE public."SensitiveReviewRound" SET status = 'superseded'
    WHERE "postId" = NEW.id AND status <> 'superseded';
  INSERT INTO public."SensitiveReviewRound" (id, "postId", revision, status, reason)
  VALUES (gen_random_uuid(), NEW.id, NEW."contentRevision",
    CASE WHEN NEW."authorId" IS NULL THEN 'blocked' ELSE 'pending' END::public."SensitiveReviewStatus",
    'Sensitive content or evidence requires three independent internal reviews.');
  IF NEW."isAnonymous" AND (actor_id = NEW."authorId" OR (TG_OP = 'UPDATE' AND actor_id = OLD."authorId")) THEN actor_id := NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public."User" WHERE id = actor_id) THEN actor_id := NULL; END IF;
  INSERT INTO public."AuditLog" (id, "actorUserId", action, "targetEntityType", "targetEntityId", "spaceId", details)
  VALUES (gen_random_uuid(), actor_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'sensitive_review_require' ELSE 'sensitive_review_invalidate' END::public."AuditAction",
    'Post', NEW.id, NEW."spaceId", jsonb_build_object('revision', NEW."contentRevision"));
  RETURN NEW;
END $$;
CREATE TRIGGER post_sensitive_revision AFTER INSERT OR UPDATE ON "Post"
FOR EACH ROW EXECUTE FUNCTION safespace_private.open_sensitive_review_revision();

CREATE FUNCTION safespace_private.invalidate_sensitive_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  old_target uuid;
  new_target uuid;
  post_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'Media' THEN
    IF TG_OP <> 'INSERT' THEN old_target := OLD."postId"; END IF;
    IF TG_OP <> 'DELETE' THEN new_target := NEW."postId"; END IF;
    FOR post_id IN SELECT id FROM public."Post" WHERE id IN (old_target, new_target) ORDER BY id LOOP
      UPDATE public."Post" SET "contentRevision" = "contentRevision" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = post_id;
    END LOOP;
  ELSE
    IF TG_TABLE_NAME = 'ReportedEntity' THEN
      IF NEW.name IS NOT DISTINCT FROM OLD.name THEN RETURN NEW; END IF;
      old_target := OLD.id; new_target := NEW.id;
    ELSE
      IF TG_OP <> 'INSERT' THEN old_target := OLD."reportedEntityId"; END IF;
      IF TG_OP <> 'DELETE' THEN new_target := NEW."reportedEntityId"; END IF;
    END IF;
    FOR post_id IN SELECT id FROM public."Post" WHERE "reportedEntityId" IN (old_target, new_target) ORDER BY id LOOP
      UPDATE public."Post" SET "contentRevision" = "contentRevision" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = post_id;
    END LOOP;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER media_sensitive_revision AFTER INSERT OR UPDATE OR DELETE ON "Media"
FOR EACH ROW EXECUTE FUNCTION safespace_private.invalidate_sensitive_evidence();
CREATE TRIGGER entity_sensitive_revision AFTER UPDATE ON "ReportedEntity"
FOR EACH ROW EXECUTE FUNCTION safespace_private.invalidate_sensitive_evidence();
CREATE TRIGGER handle_sensitive_revision AFTER INSERT OR UPDATE OR DELETE ON "ReportedEntityHandle"
FOR EACH ROW EXECUTE FUNCTION safespace_private.invalidate_sensitive_evidence();

-- Deletion detaches a reviewer without retaining a secret identifier. Start
-- over, since three distinct extant reviewers can no longer be demonstrated.
CREATE FUNCTION safespace_private.invalidate_detached_reviewer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD."reviewerUserId" IS NOT NULL AND NEW."reviewerUserId" IS NULL THEN
    UPDATE public."Post" p SET "contentRevision" = p."contentRevision" + 1, "updatedAt" = CURRENT_TIMESTAMP
    FROM public."SensitiveReviewRound" r
    WHERE r.id = NEW."roundId" AND p.id = r."postId" AND p."contentRevision" = r.revision;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sensitive_reviewer_detached AFTER UPDATE ON "SensitiveReviewDecision"
FOR EACH ROW EXECUTE FUNCTION safespace_private.invalidate_detached_reviewer();

CREATE FUNCTION safespace_private.require_sensitive_review(target_post_id uuid, expected_revision integer, review_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE p public."Post"; result_id uuid; actor_id uuid := safespace_private.current_user_id();
BEGIN
  IF NOT safespace_private.can_read_sensitive_review(target_post_id) THEN
    RAISE EXCEPTION 'review access denied' USING ERRCODE = '42501';
  END IF;
  IF review_reason IS NULL OR length(btrim(review_reason)) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'a classification reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM public."Post" WHERE id = target_post_id FOR UPDATE;
  IF expected_revision IS NULL OR p."contentRevision" <> expected_revision OR p."requiresSensitiveReview" THEN
    RAISE EXCEPTION 'review revision changed or already required' USING ERRCODE = '40001';
  END IF;
  UPDATE public."Post" SET "requiresSensitiveReview" = true, "updatedAt" = CURRENT_TIMESTAMP WHERE id = p.id RETURNING * INTO p;
  UPDATE public."SensitiveReviewRound" SET reason = btrim(review_reason)
  WHERE "postId" = p.id AND revision = p."contentRevision" RETURNING id INTO result_id;
  IF p."isAnonymous" AND p."authorId" = actor_id THEN actor_id := NULL; END IF;
  INSERT INTO public."AuditLog" (id, "actorUserId", action, "targetEntityType", "targetEntityId", "spaceId", details)
  VALUES (gen_random_uuid(), actor_id, 'sensitive_review_require', 'Post', p.id, p."spaceId",
    jsonb_build_object('revision', p."contentRevision", 'source', 'manual'));
  RETURN result_id;
END $$;

CREATE FUNCTION safespace_private.decide_sensitive_review(
  target_post_id uuid, expected_revision integer, expected_stage integer, decision text, decision_note text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  p public."Post"; r public."SensitiveReviewRound";
  actor_id uuid := safespace_private.current_user_id();
  actor_role text; actor_super boolean; next_stage integer; result_id uuid := gen_random_uuid();
BEGIN
  IF NOT safespace_private.can_read_sensitive_review(target_post_id) THEN
    RAISE EXCEPTION 'review access denied' USING ERRCODE = '42501';
  END IF;
  IF decision IS NULL OR decision NOT IN ('approve', 'request_changes')
    OR decision_note IS NULL OR length(btrim(decision_note)) NOT BETWEEN 10 AND 2000
    OR expected_stage IS NULL OR expected_stage NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'invalid review decision' USING ERRCODE = '22023';
  END IF;
  -- Evidence triggers take this same lock; an edit either precedes this check
  -- (stale revision refused) or follows the approval (which it invalidates).
  SELECT * INTO p FROM public."Post" WHERE id = target_post_id FOR UPDATE;
  IF p."authorId" IS NULL OR p."authorId" = actor_id THEN
    RAISE EXCEPTION 'an independent reviewer is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public."SensitiveReviewRound" WHERE "postId" = p.id AND revision = p."contentRevision";
  IF expected_revision IS NULL OR p."contentRevision" <> expected_revision OR r.id IS NULL OR r.status <> 'pending' THEN
    RAISE EXCEPTION 'review revision is not pending' USING ERRCODE = '40001';
  END IF;
  SELECT "isSuperAdmin" INTO actor_super FROM public."User" WHERE id = actor_id FOR SHARE;
  SELECT upper(replace(role, '-', '_')) INTO actor_role FROM public."UserSpaceMembership"
    WHERE "spaceId" = p."spaceId" AND "userId" = actor_id FOR SHARE;
  IF safespace_private.active_discipline_kind(p."spaceId", actor_id) IS NOT NULL THEN
    RAISE EXCEPTION 'review access denied' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) + 1 INTO next_stage FROM public."SensitiveReviewDecision" WHERE "roundId" = r.id;
  IF next_stage <> expected_stage THEN
    RAISE EXCEPTION 'review stage changed' USING ERRCODE = '40001';
  END IF;
  IF (next_stage = 1 AND actor_role IS DISTINCT FROM 'MODERATOR')
    OR (next_stage = 2 AND actor_role IS DISTINCT FROM 'ADMIN')
    OR (next_stage = 3 AND actor_super IS DISTINCT FROM true)
    OR EXISTS (SELECT 1 FROM public."SensitiveReviewDecision" WHERE "roundId" = r.id AND "reviewerUserId" = actor_id)
  THEN
    RAISE EXCEPTION 'a distinct reviewer with the required role is needed' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public."SensitiveReviewDecision" (id, "roundId", stage, "reviewerUserId", outcome, note)
  VALUES (result_id, r.id, next_stage, actor_id, decision::public."SensitiveReviewOutcome", btrim(decision_note));
  IF decision = 'request_changes' THEN
    UPDATE public."SensitiveReviewRound" SET status = 'changes_requested' WHERE id = r.id;
  ELSIF next_stage = 3 THEN
    UPDATE public."SensitiveReviewRound" SET status = 'approved' WHERE id = r.id;
    UPDATE public."Post" SET "verificationStatus" = 'verified', "updatedAt" = CURRENT_TIMESTAMP WHERE id = p.id;
  END IF;
  INSERT INTO public."AuditLog" (id, "actorUserId", action, "targetEntityType", "targetEntityId", "spaceId", details)
  VALUES (gen_random_uuid(), actor_id, 'sensitive_review_decide', 'Post', p.id, p."spaceId",
    jsonb_build_object('revision', r.revision, 'stage', next_stage, 'outcome', decision));
  RETURN result_id;
END $$;

COMMENT ON FUNCTION safespace_private.decide_sensitive_review(uuid, integer, integer, text, text) IS
  'Ordered MODERATOR/ADMIN/SUPERADMIN decisions by three distinct non-author users; no visibility change. Call in SERIALIZABLE transactions.';
COMMENT ON COLUMN "Post"."requiresSensitiveReview" IS
  'Sticky sensitivity classification. High severity or motivated escalation requires three internal reviews, never legal certification.';
