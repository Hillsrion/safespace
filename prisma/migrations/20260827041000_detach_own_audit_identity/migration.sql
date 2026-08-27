-- Account deletion must still work after membership removal: SELECT RLS must
-- not be widened merely to let an UPDATE turn the caller's audit row anonymous.
CREATE FUNCTION safespace_private.detach_own_audit_identity()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE actor_id uuid := safespace_private.current_user_id(); affected integer;
BEGIN
  IF safespace_private.context_mode() <> 'user' OR actor_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public."User" WHERE id = actor_id)
  THEN
    RAISE EXCEPTION 'authenticated identity required' USING ERRCODE = '42501';
  END IF;
  UPDATE public."AuditLog" SET "actorUserId" = NULL,
    "targetEntityId" = CASE WHEN "targetEntityType" = 'User' AND "targetEntityId" = actor_id
      THEN NULL ELSE "targetEntityId" END
  WHERE "actorUserId" = actor_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;
COMMENT ON FUNCTION safespace_private.detach_own_audit_identity() IS
  'Detach only the authenticated caller from audit records, without exposing other actors or widening SELECT policies.';
