-- Portability after suspension/removal, limited strictly to the caller's data.
CREATE FUNCTION safespace_private.export_own_contributions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE actor_id uuid := safespace_private.current_user_id();
BEGIN
  IF safespace_private.context_mode() <> 'user' OR actor_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public."User" WHERE id = actor_id)
  THEN
    RAISE EXCEPTION 'authenticated identity required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'contributions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', post.id, 'spaceId', post."spaceId", 'reportedEntityId', post."reportedEntityId",
        'description', post.description, 'isAnonymous', post."isAnonymous",
        'isAdminOnly', post."isAdminOnly", 'status', post.status,
        'severity', post.severity, 'verificationStatus', post."verificationStatus",
        'createdAt', post."createdAt", 'updatedAt', post."updatedAt",
        'media', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', media.id, 'fileName', media."fileName", 'mimeType', media."mimeType",
            'fileSize', media."fileSize", 'metadataStripped', media."metadataStripped",
            'isBlurred', media."isBlurred", 'createdAt', media."createdAt"
          ) ORDER BY media."createdAt", media.id)
          FROM public."Media" media
          WHERE media."postId" = post.id AND media."uploaderId" = actor_id
        ), '[]'::jsonb)
      ) ORDER BY post."createdAt", post.id)
      FROM public."Post" post WHERE post."authorId" = actor_id
    ), '[]'::jsonb),
    'uploadedMedia', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', media.id, 'postId', media."postId", 'fileName', media."fileName",
        'mimeType', media."mimeType", 'fileSize', media."fileSize",
        'metadataStripped', media."metadataStripped", 'isBlurred', media."isBlurred",
        'createdAt', media."createdAt"
      ) ORDER BY media."createdAt", media.id)
      FROM public."Media" media WHERE media."uploaderId" = actor_id
    ), '[]'::jsonb),
    'moderationFlags', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', flag.id, 'postId', flag."postId", 'reason', flag.reason,
        'status', flag.status, 'createdAt', flag."createdAt", 'resolvedAt', flag."resolvedAt"
      ) ORDER BY flag."createdAt", flag.id)
      FROM public."PostFlag" flag WHERE flag."flaggerUserId" = actor_id
    ), '[]'::jsonb),
    'sentInviteCount', (SELECT count(*) FROM public."Invite" WHERE "invitedByUserId" = actor_id)
  );
END
$$;

COMMENT ON FUNCTION safespace_private.export_own_contributions() IS
  'Self-scoped portability: owned fields even without space access; never media bytes, object keys or other members data.';
