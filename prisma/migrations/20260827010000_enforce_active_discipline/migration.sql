-- Make progressive discipline enforceable at the database authorization
-- boundary. Expired records remain immutable history but no longer affect
-- access. Super-admin break-glass access remains outside space discipline.
CREATE OR REPLACE FUNCTION safespace_private.active_discipline_kind(
  target_space_id uuid,
  target_user_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT action.kind::text
  FROM public."DisciplinaryAction" action
  WHERE action."spaceId" = target_space_id
    AND action."userId" = target_user_id
    AND action.status = 'active'
    AND action.kind IN ('restriction', 'suspension')
    AND (action."expiresAt" IS NULL OR action."expiresAt" > CURRENT_TIMESTAMP)
  ORDER BY
    CASE action.kind WHEN 'suspension' THEN 2 ELSE 1 END DESC,
    action.level DESC,
    action."createdAt" DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION safespace_private.is_space_member(target_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT safespace_private.is_superadmin()
    OR (
      safespace_private.active_discipline_kind(
        target_space_id,
        safespace_private.current_user_id()
      ) IS DISTINCT FROM 'suspension'
      AND EXISTS (
        SELECT 1
        FROM public."UserSpaceMembership" membership
        WHERE membership."spaceId" = target_space_id
          AND membership."userId" = safespace_private.current_user_id()
      )
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
    OR (
      safespace_private.active_discipline_kind(
        target_space_id,
        safespace_private.current_user_id()
      ) IS NULL
      AND EXISTS (
        SELECT 1
        FROM public."UserSpaceMembership" membership
        WHERE membership."spaceId" = target_space_id
          AND membership."userId" = safespace_private.current_user_id()
          AND upper(replace(membership.role, '-', '_')) IN ('ADMIN', 'MODERATOR')
      )
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
    OR (
      safespace_private.active_discipline_kind(
        target_space_id,
        safespace_private.current_user_id()
      ) IS NULL
      AND EXISTS (
        SELECT 1
        FROM public."UserSpaceMembership" membership
        WHERE membership."spaceId" = target_space_id
          AND membership."userId" = safespace_private.current_user_id()
          AND upper(replace(membership.role, '-', '_')) = 'ADMIN'
      )
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
    OR (
      safespace_private.active_discipline_kind(
        target_space_id,
        safespace_private.current_user_id()
      ) IS NULL
      AND EXISTS (
        SELECT 1
        FROM public."UserSpaceMembership" membership
        WHERE membership."spaceId" = target_space_id
          AND membership."userId" = safespace_private.current_user_id()
          AND upper(replace(membership.role, '-', '_')) IN ('ADMIN', 'MODERATOR', 'EDITOR')
      )
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
        AND safespace_private.is_space_member(viewer."spaceId")
    )
$$;
