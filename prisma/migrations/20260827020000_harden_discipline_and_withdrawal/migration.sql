-- Effective discipline must govern administrative writes as well as reads.
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
    AND safespace_private.has_elevated_space_role(target_space_id)
    AND (
      safespace_private.is_superadmin()
      OR EXISTS (
        SELECT 1
        FROM public."UserSpaceMembership" actor
        JOIN public."UserSpaceMembership" target ON target."spaceId" = actor."spaceId"
        WHERE actor."spaceId" = target_space_id
          AND actor."userId" = safespace_private.current_user_id()
          AND target."userId" = target_user_id
          AND CASE upper(replace(actor.role, '-', '_'))
                WHEN 'ADMIN' THEN 3 WHEN 'MODERATOR' THEN 2 ELSE -1 END
              > CASE upper(replace(target.role, '-', '_'))
                  WHEN 'ADMIN' THEN 3 WHEN 'MODERATOR' THEN 2
                  WHEN 'EDITOR' THEN 1 WHEN 'READ_ONLY' THEN 0 ELSE -1 END
      )
    )
$$;

-- The leave guard must not infer the number of administrators from an
-- RLS-filtered roster (a suspended administrator can only see themself).
CREATE FUNCTION safespace_private.own_membership_can_leave(target_space_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT safespace_private.context_mode() = 'user'
    AND EXISTS (
      SELECT 1 FROM public."UserSpaceMembership" actor
      WHERE actor."spaceId" = target_space_id
        AND actor."userId" = safespace_private.current_user_id()
        AND (
          upper(replace(actor.role, '-', '_')) <> 'ADMIN'
          OR EXISTS (
            SELECT 1 FROM public."UserSpaceMembership" other
            JOIN public."User" other_user ON other_user.id = other."userId"
            WHERE other."spaceId" = target_space_id
              AND other."userId" <> actor."userId"
              AND upper(replace(other.role, '-', '_')) = 'ADMIN'
              AND (other_user."isSuperAdmin" OR
                safespace_private.active_discipline_kind(target_space_id, other."userId") IS NULL)
          )
        )
    )
$$;

-- A narrowly scoped privacy operation: callers can withdraw only their own
-- contributions, never read content through this function. It bypasses RLS
-- solely to keep data withdrawal available after suspension or membership
-- removal. Object keys are queued before cascade deletion and returned only
-- to the server-side lifecycle service for immediate private-storage cleanup.
CREATE FUNCTION safespace_private.withdraw_own_contributions(
  target_space_id uuid,
  contribution_policy text
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  actor_id uuid := safespace_private.current_user_id();
  storage_keys text[];
BEGIN
  IF safespace_private.context_mode() <> 'user' OR actor_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public."User" WHERE id = actor_id)
  THEN
    RAISE EXCEPTION 'authenticated identity required' USING ERRCODE = '42501';
  END IF;
  IF contribution_policy IS NULL OR contribution_policy NOT IN ('delete', 'anonymize') THEN
    RAISE EXCEPTION 'invalid contribution policy' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT media."storageKey"), ARRAY[]::text[])
  INTO storage_keys
  FROM public."Media" media
  JOIN public."Post" post ON post.id = media."postId"
  WHERE (target_space_id IS NULL OR post."spaceId" = target_space_id)
    AND (media."uploaderId" = actor_id
      OR (contribution_policy = 'delete' AND post."authorId" = actor_id));

  INSERT INTO public."MediaDeletionJob"
    (id, "storageKey", "requestedByUserId", "spaceId", "updatedAt")
  SELECT gen_random_uuid(), media."storageKey", actor_id, post."spaceId", CURRENT_TIMESTAMP
  FROM public."Media" media
  JOIN public."Post" post ON post.id = media."postId"
  WHERE media."storageKey" = ANY(storage_keys)
  ON CONFLICT ("storageKey") DO NOTHING;

  IF contribution_policy = 'delete' THEN
    DELETE FROM public."Post"
    WHERE "authorId" = actor_id
      AND (target_space_id IS NULL OR "spaceId" = target_space_id);
  ELSE
    UPDATE public."Post" SET "authorId" = NULL, "isAnonymous" = true, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "authorId" = actor_id
      AND (target_space_id IS NULL OR "spaceId" = target_space_id);
  END IF;

  DELETE FROM public."Media" media
  USING public."Post" post
  WHERE post.id = media."postId" AND media."uploaderId" = actor_id
    AND (target_space_id IS NULL OR post."spaceId" = target_space_id);

  DELETE FROM public."PostFlag" flag
  USING public."Post" post
  WHERE post.id = flag."postId" AND flag."flaggerUserId" = actor_id
    AND (target_space_id IS NULL OR post."spaceId" = target_space_id);

  UPDATE public."PostFlag" flag SET "resolvedByUserId" = NULL
  FROM public."Post" post
  WHERE post.id = flag."postId" AND flag."resolvedByUserId" = actor_id
    AND (target_space_id IS NULL OR post."spaceId" = target_space_id);

  DELETE FROM public."Invite"
  WHERE "invitedByUserId" = actor_id
    AND (target_space_id IS NULL OR "spaceId" = target_space_id);

  RETURN storage_keys;
END
$$;

-- Withdrawal now has its own self-scoped primitive; broad UPDATE/DELETE
-- exceptions for authors and former flag resolvers are no longer necessary.
DROP POLICY post_update ON "Post";
CREATE POLICY post_update ON "Post" FOR UPDATE
  USING (
    safespace_private.has_elevated_space_role("spaceId")
    OR ("authorId" = safespace_private.current_user_id()
      AND safespace_private.can_write_space("spaceId"))
  )
  WITH CHECK (
    safespace_private.entity_space_id("reportedEntityId") = "spaceId"
    AND (safespace_private.has_elevated_space_role("spaceId")
      OR ("authorId" = safespace_private.current_user_id()
        AND safespace_private.can_write_space("spaceId")))
  );
DROP POLICY post_delete ON "Post";
CREATE POLICY post_delete ON "Post" FOR DELETE USING (
  safespace_private.has_elevated_space_role("spaceId")
);
DROP POLICY media_delete ON "Media";
CREATE POLICY media_delete ON "Media" FOR DELETE USING (
  ("uploaderId" = safespace_private.current_user_id()
    AND safespace_private.can_write_space(safespace_private.post_space_id("postId")))
  OR safespace_private.has_elevated_space_role(safespace_private.post_space_id("postId"))
);
DROP POLICY post_flag_update ON "PostFlag";
CREATE POLICY post_flag_update ON "PostFlag" FOR UPDATE
  USING (safespace_private.has_elevated_space_role(safespace_private.post_space_id("postId")))
  WITH CHECK (safespace_private.has_elevated_space_role(safespace_private.post_space_id("postId")));

COMMENT ON FUNCTION safespace_private.withdraw_own_contributions(uuid, text) IS
  'Self-scoped data withdrawal even after loss of space access; never a content-read or moderation bypass.';
