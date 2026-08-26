-- Governance primitives: appeals against flag decisions and an immutable,
-- progressive discipline trail. The app role must remain NOBYPASSRLS.
CREATE TYPE "ModerationAppealStatus" AS ENUM ('pending', 'upheld', 'overturned');
CREATE TYPE "DisciplineActionKind" AS ENUM ('warning', 'restriction', 'suspension');
CREATE TYPE "DisciplineActionStatus" AS ENUM ('active', 'revoked', 'expired');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'moderation_appeal_create';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'moderation_appeal_decide';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'discipline_issue';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'discipline_revoke';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'account_update';

CREATE TABLE "ModerationAppeal" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "postFlagId" UUID NOT NULL,
  "filedByUserId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "ModerationAppealStatus" NOT NULL DEFAULT 'pending',
  "reviewedByUserId" UUID,
  "decisionNote" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModerationAppeal_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE,
  CONSTRAINT "ModerationAppeal_postFlagId_fkey" FOREIGN KEY ("postFlagId") REFERENCES "PostFlag"("id") ON DELETE CASCADE,
  CONSTRAINT "ModerationAppeal_filedByUserId_fkey" FOREIGN KEY ("filedByUserId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "ModerationAppeal_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE TABLE "DisciplinaryAction" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "userId" UUID,
  "issuedByUserId" UUID,
  "kind" "DisciplineActionKind" NOT NULL,
  "level" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "DisciplineActionStatus" NOT NULL DEFAULT 'active',
  "expiresAt" TIMESTAMP(3),
  "revokedByUserId" UUID,
  "revokedAt" TIMESTAMP(3),
  "revocationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisciplinaryAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DisciplinaryAction_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE,
  CONSTRAINT "DisciplinaryAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "DisciplinaryAction_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "DisciplinaryAction_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "DisciplinaryAction_level_check" CHECK ("level" > 0)
);

CREATE INDEX "ModerationAppeal_spaceId_status_createdAt_idx" ON "ModerationAppeal"("spaceId", "status", "createdAt");
CREATE INDEX "ModerationAppeal_filedByUserId_createdAt_idx" ON "ModerationAppeal"("filedByUserId", "createdAt");
CREATE UNIQUE INDEX "ModerationAppeal_open_filer_flag_key" ON "ModerationAppeal"("postFlagId", "filedByUserId") WHERE "status" = 'pending';
CREATE INDEX "DisciplinaryAction_spaceId_userId_createdAt_idx" ON "DisciplinaryAction"("spaceId", "userId", "createdAt");
CREATE INDEX "DisciplinaryAction_spaceId_status_createdAt_idx" ON "DisciplinaryAction"("spaceId", "status", "createdAt");

CREATE OR REPLACE FUNCTION safespace_private.post_flag_space_id(target_flag_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT post."spaceId"
  FROM public."PostFlag" flag
  JOIN public."Post" post ON post.id = flag."postId"
  WHERE flag.id = target_flag_id
$$;

-- Duplicate the application hierarchy at the database boundary. A moderator
-- cannot issue a record against another moderator/admin, and an administrator
-- cannot target another administrator. Super-admins still cannot target
-- themselves.
CREATE OR REPLACE FUNCTION safespace_private.may_discipline(
  target_space_id uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT target_user_id IS NOT NULL
    AND target_user_id <> safespace_private.current_user_id()
    AND (
      safespace_private.is_superadmin()
      OR EXISTS (
        SELECT 1
        FROM public."UserSpaceMembership" actor
        JOIN public."UserSpaceMembership" target
          ON target."spaceId" = actor."spaceId"
        WHERE actor."spaceId" = target_space_id
          AND actor."userId" = safespace_private.current_user_id()
          AND target."userId" = target_user_id
          AND (
            CASE upper(replace(actor.role, '-', '_'))
              WHEN 'ADMIN' THEN 3
              WHEN 'MODERATOR' THEN 2
              WHEN 'EDITOR' THEN 1
              WHEN 'READ_ONLY' THEN 0
              ELSE -1
            END
          ) > (
            CASE upper(replace(target.role, '-', '_'))
              WHEN 'ADMIN' THEN 3
              WHEN 'MODERATOR' THEN 2
              WHEN 'EDITOR' THEN 1
              WHEN 'READ_ONLY' THEN 0
              ELSE -1
            END
          )
      )
    )
$$;

-- Appeals are evidence records: only the explicit decision columns may change,
-- and a final decision can never be silently rewritten or reopened.
CREATE OR REPLACE FUNCTION safespace_private.enforce_appeal_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW."spaceId" IS DISTINCT FROM OLD."spaceId"
    OR NEW."postFlagId" IS DISTINCT FROM OLD."postFlagId"
    OR NEW."filedByUserId" IS DISTINCT FROM OLD."filedByUserId"
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'moderation appeal evidence is immutable';
  END IF;
  -- ON DELETE SET NULL may anonymize a departed reviewer after a final
  -- decision; it must not change the decision itself.
  IF OLD.status <> 'pending'
    AND NEW.status = OLD.status
    AND NEW."reviewedByUserId" IS NULL
    AND NEW."decisionNote" IS NOT DISTINCT FROM OLD."decisionNote"
    AND NEW."decidedAt" IS NOT DISTINCT FROM OLD."decidedAt"
  THEN
    RETURN NEW;
  END IF;
  IF OLD.status <> 'pending'
    OR NEW.status NOT IN ('upheld', 'overturned')
    OR NEW."reviewedByUserId" IS NULL
    OR NEW."decisionNote" IS NULL
    OR btrim(NEW."decisionNote") = ''
    OR NEW."decidedAt" IS NULL
  THEN
    RAISE EXCEPTION 'invalid moderation appeal decision transition';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER moderation_appeal_immutable_update
BEFORE UPDATE ON "ModerationAppeal"
FOR EACH ROW EXECUTE FUNCTION safespace_private.enforce_appeal_immutability();

-- Disciplinary records retain their original subject, issuer, rationale and
-- progressive level. Revocation appends resolution fields without erasure.
CREATE OR REPLACE FUNCTION safespace_private.enforce_discipline_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW."spaceId" IS DISTINCT FROM OLD."spaceId"
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.level IS DISTINCT FROM OLD.level
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'disciplinary evidence is immutable';
  END IF;
  -- Nullable user relations may only move from an identity to NULL when the
  -- related account is deleted. They can never be reassigned.
  IF (NEW."userId" IS DISTINCT FROM OLD."userId" AND NEW."userId" IS NOT NULL)
    OR (NEW."issuedByUserId" IS DISTINCT FROM OLD."issuedByUserId" AND NEW."issuedByUserId" IS NOT NULL)
    OR (
      NEW."revokedByUserId" IS DISTINCT FROM OLD."revokedByUserId"
      AND NEW."revokedByUserId" IS NOT NULL
      AND NOT (OLD.status = 'active' AND NEW.status = 'revoked')
    )
  THEN
    RAISE EXCEPTION 'disciplinary identities cannot be reassigned';
  END IF;
  IF NEW.status = OLD.status
    AND NEW."revokedAt" IS NOT DISTINCT FROM OLD."revokedAt"
    AND NEW."revocationReason" IS NOT DISTINCT FROM OLD."revocationReason"
  THEN
    RETURN NEW;
  END IF;
  IF OLD.status <> 'active'
    OR NEW.status <> 'revoked'
    OR NEW."revokedByUserId" IS NULL
    OR NEW."revokedAt" IS NULL
    OR NEW."revocationReason" IS NULL
    OR btrim(NEW."revocationReason") = ''
  THEN
    RAISE EXCEPTION 'invalid disciplinary revocation transition';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER disciplinary_action_immutable_update
BEFORE UPDATE ON "DisciplinaryAction"
FOR EACH ROW EXECUTE FUNCTION safespace_private.enforce_discipline_immutability();

ALTER TABLE "ModerationAppeal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DisciplinaryAction" ENABLE ROW LEVEL SECURITY;

CREATE POLICY moderation_appeal_select ON "ModerationAppeal" FOR SELECT USING (
  ("filedByUserId" = safespace_private.current_user_id()
    AND safespace_private.is_space_member("spaceId"))
  OR safespace_private.has_elevated_space_role("spaceId")
);
CREATE POLICY moderation_appeal_insert ON "ModerationAppeal" FOR INSERT WITH CHECK (
  "filedByUserId" = safespace_private.current_user_id()
  AND safespace_private.is_space_member("spaceId")
  AND "spaceId" = safespace_private.post_flag_space_id("postFlagId")
);
CREATE POLICY moderation_appeal_update ON "ModerationAppeal" FOR UPDATE
  USING (safespace_private.has_elevated_space_role("spaceId"))
  WITH CHECK (
    safespace_private.has_elevated_space_role("spaceId")
    AND "reviewedByUserId" = safespace_private.current_user_id()
  );
CREATE POLICY moderation_appeal_delete ON "ModerationAppeal" FOR DELETE USING (false);

CREATE POLICY disciplinary_action_select ON "DisciplinaryAction" FOR SELECT USING (
  safespace_private.has_elevated_space_role("spaceId")
  OR (
    "userId" = safespace_private.current_user_id()
    AND safespace_private.is_space_member("spaceId")
  )
);
CREATE POLICY disciplinary_action_insert ON "DisciplinaryAction" FOR INSERT WITH CHECK (
  safespace_private.may_discipline("spaceId", "userId")
  AND "issuedByUserId" = safespace_private.current_user_id()
);
CREATE POLICY disciplinary_action_update ON "DisciplinaryAction" FOR UPDATE
  USING (safespace_private.may_discipline("spaceId", "userId"))
  WITH CHECK (
    safespace_private.may_discipline("spaceId", "userId")
    AND "revokedByUserId" = safespace_private.current_user_id()
  );
CREATE POLICY disciplinary_action_delete ON "DisciplinaryAction" FOR DELETE USING (false);
