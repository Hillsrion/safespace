-- A forgotten application status filter must not expose a moderated report
-- or its evidence. Authors retain read access to their own contribution for
-- data control/export; ordinary members cannot read another author's hidden
-- post. Suspension still removes all content access to the space.
CREATE OR REPLACE FUNCTION safespace_private.can_read_post(target_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Post" post
    WHERE post.id = target_post_id
      AND safespace_private.is_space_member(post."spaceId")
      AND (post.status = 'active'
        OR post."authorId" = safespace_private.current_user_id()
        OR safespace_private.has_elevated_space_role(post."spaceId"))
      AND (post."isAdminOnly" = false
        OR post."authorId" = safespace_private.current_user_id()
        OR safespace_private.has_elevated_space_role(post."spaceId"))
  )
$$;

DROP POLICY post_select ON "Post";
CREATE POLICY post_select ON "Post" FOR SELECT USING (
  safespace_private.is_space_member("spaceId")
  AND (status = 'active'
    OR "authorId" = safespace_private.current_user_id()
    OR safespace_private.has_elevated_space_role("spaceId"))
  AND ("isAdminOnly" = false
    OR "authorId" = safespace_private.current_user_id()
    OR safespace_private.has_elevated_space_role("spaceId"))
);
