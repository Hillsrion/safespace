-- A suspended member must still be able to see the disciplinary record that
-- explains the loss of access. This also lets application authorization derive
-- the same effective access as the SECURITY DEFINER RLS helpers.
DROP POLICY disciplinary_action_select ON "DisciplinaryAction";
CREATE POLICY disciplinary_action_select ON "DisciplinaryAction" FOR SELECT USING (
  safespace_private.has_elevated_space_role("spaceId")
  OR "userId" = safespace_private.current_user_id()
);
