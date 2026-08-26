-- SafeSpace row-level security.
--
-- IMPORTANT: the application role must be a non-owner role with NOBYPASSRLS.
-- PostgreSQL table owners and roles carrying BYPASSRLS are intentionally left
-- available for migrations, restores and explicitly privileged system jobs.

CREATE SCHEMA IF NOT EXISTS safespace_private;
REVOKE ALL ON SCHEMA safespace_private FROM PUBLIC;
GRANT USAGE ON SCHEMA safespace_private TO PUBLIC;

CREATE OR REPLACE FUNCTION safespace_private.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('safespace.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION safespace_private.context_mode()
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(NULLIF(current_setting('safespace.context_mode', true), ''), 'none')
$$;

CREATE OR REPLACE FUNCTION safespace_private.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT safespace_private.context_mode() = 'user'
    AND current_setting('safespace.is_superadmin', true) = 'on'
$$;

CREATE OR REPLACE FUNCTION safespace_private.invite_token_matches(candidate text)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT safespace_private.context_mode() = 'registration'
    AND candidate = ANY (
      string_to_array(current_setting('safespace.invite_tokens', true), ',')
    )
$$;

-- These helpers are SECURITY DEFINER so their membership lookups do not
-- recurse through the policies they support. Their fixed search_path prevents
-- callers from substituting objects through a writable schema.
CREATE OR REPLACE FUNCTION safespace_private.is_space_member(target_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT safespace_private.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public."UserSpaceMembership" membership
      WHERE membership."spaceId" = target_space_id
        AND membership."userId" = safespace_private.current_user_id()
    )
$$;

CREATE OR REPLACE FUNCTION safespace_private.has_elevated_space_role(target_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT safespace_private.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public."UserSpaceMembership" membership
      WHERE membership."spaceId" = target_space_id
        AND membership."userId" = safespace_private.current_user_id()
        AND upper(replace(membership.role, '-', '_')) IN ('ADMIN', 'MODERATOR')
    )
$$;

CREATE OR REPLACE FUNCTION safespace_private.is_space_admin(target_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT safespace_private.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public."UserSpaceMembership" membership
      WHERE membership."spaceId" = target_space_id
        AND membership."userId" = safespace_private.current_user_id()
        AND upper(replace(membership.role, '-', '_')) = 'ADMIN'
    )
$$;

CREATE OR REPLACE FUNCTION safespace_private.can_write_space(target_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT safespace_private.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public."UserSpaceMembership" membership
      WHERE membership."spaceId" = target_space_id
        AND membership."userId" = safespace_private.current_user_id()
        AND upper(replace(membership.role, '-', '_')) IN ('ADMIN', 'MODERATOR', 'EDITOR')
    )
$$;

CREATE OR REPLACE FUNCTION safespace_private.can_read_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT safespace_private.is_superadmin()
    OR target_user_id = safespace_private.current_user_id()
    OR EXISTS (
      SELECT 1
      FROM public."UserSpaceMembership" viewer
      JOIN public."UserSpaceMembership" target
        ON target."spaceId" = viewer."spaceId"
      WHERE viewer."userId" = safespace_private.current_user_id()
        AND target."userId" = target_user_id
    )
$$;

CREATE OR REPLACE FUNCTION safespace_private.registration_can_read_space(target_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT safespace_private.context_mode() = 'registration'
    AND EXISTS (
      SELECT 1
      FROM public."Invite" invite
      WHERE invite."spaceId" = target_space_id
        AND safespace_private.invite_token_matches(invite.token)
    )
$$;

CREATE OR REPLACE FUNCTION safespace_private.registration_can_create_membership(
  target_user_id uuid,
  target_space_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT safespace_private.context_mode() = 'registration'
    AND EXISTS (
      SELECT 1
      FROM public."Invite" invite
      JOIN public."User" registering_user
        ON registering_user.id = target_user_id
      WHERE invite."spaceId" = target_space_id
        AND invite."isUsed" = true
        AND lower(invite.email) = lower(registering_user.email)
        AND lower(registering_user.email) = lower(current_setting('safespace.login_email', true))
        AND safespace_private.invite_token_matches(invite.token)
    )
$$;

CREATE OR REPLACE FUNCTION safespace_private.entity_space_id(target_entity_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT entity."spaceId"
  FROM public."ReportedEntity" entity
  WHERE entity.id = target_entity_id
$$;

CREATE OR REPLACE FUNCTION safespace_private.post_space_id(target_post_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT post."spaceId"
  FROM public."Post" post
  WHERE post.id = target_post_id
$$;

CREATE OR REPLACE FUNCTION safespace_private.can_read_post(target_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Post" post
    WHERE post.id = target_post_id
      AND safespace_private.is_space_member(post."spaceId")
      AND (
        post."isAdminOnly" = false
        OR post."authorId" = safespace_private.current_user_id()
        OR safespace_private.has_elevated_space_role(post."spaceId")
      )
  )
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA safespace_private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA safespace_private TO PUBLIC;

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Space" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserSpaceMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportedEntity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportedEntityHandle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PostFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedSearch" ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_select ON "User" FOR SELECT USING (
  safespace_private.can_read_user(id)
  OR (
    safespace_private.context_mode() IN ('authentication', 'registration')
    AND lower(email) = lower(current_setting('safespace.login_email', true))
  )
);
CREATE POLICY user_insert ON "User" FOR INSERT WITH CHECK (
  safespace_private.is_superadmin()
  OR (
    safespace_private.context_mode() = 'registration'
    AND lower(email) = lower(current_setting('safespace.login_email', true))
  )
);
CREATE POLICY user_update ON "User" FOR UPDATE
  USING (safespace_private.is_superadmin() OR id = safespace_private.current_user_id())
  WITH CHECK (
    safespace_private.is_superadmin()
    OR (id = safespace_private.current_user_id() AND "isSuperAdmin" = false)
  );
CREATE POLICY user_delete ON "User" FOR DELETE USING (
  safespace_private.is_superadmin() OR id = safespace_private.current_user_id()
);

CREATE POLICY space_select ON "Space" FOR SELECT USING (
  safespace_private.is_space_member(id)
  OR "createdBy" = safespace_private.current_user_id()
  OR safespace_private.registration_can_read_space(id)
);
CREATE POLICY space_insert ON "Space" FOR INSERT WITH CHECK (
  safespace_private.is_superadmin()
  AND "createdBy" = safespace_private.current_user_id()
);
CREATE POLICY space_update ON "Space" FOR UPDATE
  USING (safespace_private.is_superadmin())
  WITH CHECK (safespace_private.is_superadmin());
CREATE POLICY space_delete ON "Space" FOR DELETE USING (
  safespace_private.is_superadmin()
);

CREATE POLICY membership_select ON "UserSpaceMembership" FOR SELECT USING (
  "userId" = safespace_private.current_user_id()
  OR safespace_private.is_space_admin("spaceId")
  OR safespace_private.registration_can_create_membership("userId", "spaceId")
);
CREATE POLICY membership_insert ON "UserSpaceMembership" FOR INSERT WITH CHECK (
  safespace_private.is_space_admin("spaceId")
  OR safespace_private.registration_can_create_membership("userId", "spaceId")
);
CREATE POLICY membership_update ON "UserSpaceMembership" FOR UPDATE
  USING (safespace_private.is_space_admin("spaceId"))
  WITH CHECK (safespace_private.is_space_admin("spaceId"));
CREATE POLICY membership_delete ON "UserSpaceMembership" FOR DELETE USING (
  safespace_private.is_space_admin("spaceId")
  OR "userId" = safespace_private.current_user_id()
);

CREATE POLICY invite_select ON "Invite" FOR SELECT USING (
  safespace_private.is_space_admin("spaceId")
  OR safespace_private.invite_token_matches(token)
);
CREATE POLICY invite_insert ON "Invite" FOR INSERT WITH CHECK (
  safespace_private.is_space_admin("spaceId")
  AND "invitedByUserId" = safespace_private.current_user_id()
);
CREATE POLICY invite_update ON "Invite" FOR UPDATE
  USING (
    safespace_private.is_space_admin("spaceId")
    OR safespace_private.invite_token_matches(token)
  )
  WITH CHECK (
    safespace_private.is_space_admin("spaceId")
    OR safespace_private.invite_token_matches(token)
  );
CREATE POLICY invite_delete ON "Invite" FOR DELETE USING (
  safespace_private.is_space_admin("spaceId")
  OR "invitedByUserId" = safespace_private.current_user_id()
);

CREATE POLICY reported_entity_select ON "ReportedEntity" FOR SELECT USING (
  safespace_private.is_space_member("spaceId")
);
CREATE POLICY reported_entity_insert ON "ReportedEntity" FOR INSERT WITH CHECK (
  safespace_private.can_write_space("spaceId")
  AND (
    "addedByUserId" IS NULL
    OR "addedByUserId" = safespace_private.current_user_id()
    OR safespace_private.is_superadmin()
  )
);
CREATE POLICY reported_entity_update ON "ReportedEntity" FOR UPDATE
  USING (safespace_private.is_space_admin("spaceId"))
  WITH CHECK (safespace_private.is_space_admin("spaceId"));
CREATE POLICY reported_entity_delete ON "ReportedEntity" FOR DELETE USING (
  safespace_private.is_space_admin("spaceId")
);

CREATE POLICY reported_entity_handle_select ON "ReportedEntityHandle" FOR SELECT USING (
  safespace_private.is_space_member(
    safespace_private.entity_space_id("reportedEntityId")
  )
);
CREATE POLICY reported_entity_handle_insert ON "ReportedEntityHandle" FOR INSERT WITH CHECK (
  safespace_private.can_write_space(
    safespace_private.entity_space_id("reportedEntityId")
  )
);
CREATE POLICY reported_entity_handle_update ON "ReportedEntityHandle" FOR UPDATE
  USING (
    safespace_private.is_space_admin(
      safespace_private.entity_space_id("reportedEntityId")
    )
  )
  WITH CHECK (
    safespace_private.is_space_admin(
      safespace_private.entity_space_id("reportedEntityId")
    )
  );
CREATE POLICY reported_entity_handle_delete ON "ReportedEntityHandle" FOR DELETE USING (
  safespace_private.is_space_admin(
    safespace_private.entity_space_id("reportedEntityId")
  )
);

CREATE POLICY post_select ON "Post" FOR SELECT USING (
  safespace_private.is_space_member("spaceId")
  AND (
    "isAdminOnly" = false
    OR "authorId" = safespace_private.current_user_id()
    OR safespace_private.has_elevated_space_role("spaceId")
  )
);
CREATE POLICY post_insert ON "Post" FOR INSERT WITH CHECK (
  safespace_private.can_write_space("spaceId")
  AND safespace_private.entity_space_id("reportedEntityId") = "spaceId"
  AND (
    "authorId" = safespace_private.current_user_id()
    OR safespace_private.is_superadmin()
  )
);
CREATE POLICY post_update ON "Post" FOR UPDATE
  USING (
    safespace_private.has_elevated_space_role("spaceId")
    OR "authorId" = safespace_private.current_user_id()
  )
  WITH CHECK (
    safespace_private.entity_space_id("reportedEntityId") = "spaceId"
    AND (
      safespace_private.has_elevated_space_role("spaceId")
      OR (
        "authorId" = safespace_private.current_user_id()
        AND safespace_private.can_write_space("spaceId")
      )
      OR "authorId" IS NULL
    )
  );
CREATE POLICY post_delete ON "Post" FOR DELETE USING (
  safespace_private.has_elevated_space_role("spaceId")
  OR "authorId" = safespace_private.current_user_id()
);

CREATE POLICY media_select ON "Media" FOR SELECT USING (
  safespace_private.can_read_post("postId")
);
CREATE POLICY media_insert ON "Media" FOR INSERT WITH CHECK (
  "uploaderId" = safespace_private.current_user_id()
  AND safespace_private.can_write_space(
    safespace_private.post_space_id("postId")
  )
);
CREATE POLICY media_update ON "Media" FOR UPDATE
  USING (
    (
      "uploaderId" = safespace_private.current_user_id()
      AND safespace_private.can_write_space(
        safespace_private.post_space_id("postId")
      )
    )
    OR safespace_private.has_elevated_space_role(
      safespace_private.post_space_id("postId")
    )
  )
  WITH CHECK (
    (
      "uploaderId" = safespace_private.current_user_id()
      AND safespace_private.can_write_space(
        safespace_private.post_space_id("postId")
      )
    )
    OR safespace_private.has_elevated_space_role(
      safespace_private.post_space_id("postId")
    )
  );
CREATE POLICY media_delete ON "Media" FOR DELETE USING (
  "uploaderId" = safespace_private.current_user_id()
  OR safespace_private.has_elevated_space_role(
    safespace_private.post_space_id("postId")
  )
);

CREATE POLICY post_flag_select ON "PostFlag" FOR SELECT USING (
  "flaggerUserId" = safespace_private.current_user_id()
  OR safespace_private.has_elevated_space_role(
    safespace_private.post_space_id("postId")
  )
);
CREATE POLICY post_flag_insert ON "PostFlag" FOR INSERT WITH CHECK (
  "flaggerUserId" = safespace_private.current_user_id()
  AND safespace_private.can_read_post("postId")
);
CREATE POLICY post_flag_update ON "PostFlag" FOR UPDATE
  USING (
    "resolvedByUserId" = safespace_private.current_user_id()
    OR safespace_private.has_elevated_space_role(
      safespace_private.post_space_id("postId")
    )
  )
  WITH CHECK (
    "resolvedByUserId" IS NULL
    OR "resolvedByUserId" = safespace_private.current_user_id()
    OR safespace_private.has_elevated_space_role(
      safespace_private.post_space_id("postId")
    )
  );
CREATE POLICY post_flag_delete ON "PostFlag" FOR DELETE USING (
  "flaggerUserId" = safespace_private.current_user_id()
  OR safespace_private.has_elevated_space_role(
    safespace_private.post_space_id("postId")
  )
);

CREATE POLICY audit_log_select ON "AuditLog" FOR SELECT USING (
  safespace_private.is_superadmin()
  OR "actorUserId" = safespace_private.current_user_id()
  OR (
    "spaceId" IS NOT NULL
    AND safespace_private.has_elevated_space_role("spaceId")
  )
);
CREATE POLICY audit_log_insert ON "AuditLog" FOR INSERT WITH CHECK (
  safespace_private.is_superadmin()
  OR "actorUserId" = safespace_private.current_user_id()
  OR (
    "actorUserId" IS NULL
    AND "spaceId" IS NOT NULL
    AND safespace_private.is_space_member("spaceId")
  )
);
CREATE POLICY audit_log_update ON "AuditLog" FOR UPDATE
  USING (
    safespace_private.is_superadmin()
    OR "actorUserId" = safespace_private.current_user_id()
  )
  WITH CHECK (
    safespace_private.is_superadmin()
    OR "actorUserId" IS NULL
  );
CREATE POLICY audit_log_delete ON "AuditLog" FOR DELETE USING (
  false
);

-- Saved searches are private account data. A super-administrator still owns
-- only its own saved searches; global administration does not imply access to
-- another user's personal search history.
CREATE POLICY saved_search_select ON "SavedSearch" FOR SELECT USING (
  "userId" = safespace_private.current_user_id()
);
CREATE POLICY saved_search_insert ON "SavedSearch" FOR INSERT WITH CHECK (
  "userId" = safespace_private.current_user_id()
  AND (
    "spaceId" IS NULL
    OR safespace_private.is_space_member("spaceId")
  )
);
CREATE POLICY saved_search_update ON "SavedSearch" FOR UPDATE
  USING ("userId" = safespace_private.current_user_id())
  WITH CHECK (
    "userId" = safespace_private.current_user_id()
    AND (
      "spaceId" IS NULL
      OR safespace_private.is_space_member("spaceId")
    )
  );
CREATE POLICY saved_search_delete ON "SavedSearch" FOR DELETE USING (
  "userId" = safespace_private.current_user_id()
);

COMMENT ON SCHEMA safespace_private IS
  'Security-definer helpers for SafeSpace RLS policies. Application connections must be non-owner NOBYPASSRLS roles.';
