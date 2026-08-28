-- Keep only a coarse UTC calendar day for a member's activity in one space.
-- Activity is tied to membership so leaving/removal erases this derived value.
CREATE TABLE "MemberSpaceActivity" (
  "userId" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "lastActiveDay" DATE NOT NULL,

  CONSTRAINT "MemberSpaceActivity_pkey" PRIMARY KEY ("userId", "spaceId"),
  CONSTRAINT "MemberSpaceActivity_userId_spaceId_fkey"
    FOREIGN KEY ("userId", "spaceId")
    REFERENCES "UserSpaceMembership"("userId", "spaceId")
    ON DELETE CASCADE
    ON UPDATE NO ACTION
);

CREATE INDEX "MemberSpaceActivity_spaceId_lastActiveDay_idx"
  ON "MemberSpaceActivity"("spaceId", "lastActiveDay");

ALTER TABLE "MemberSpaceActivity" ENABLE ROW LEVEL SECURITY;

-- The client is never allowed to select a timestamp: the database assigns the
-- current UTC date for both insert and update. Keeping the composite key
-- immutable prevents turning a permitted update into activity for another
-- person or another space.
CREATE OR REPLACE FUNCTION safespace_private.guard_member_space_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (NEW."userId" IS DISTINCT FROM OLD."userId"
      OR NEW."spaceId" IS DISTINCT FROM OLD."spaceId") THEN
    RAISE EXCEPTION 'MemberSpaceActivity membership cannot be reassigned'
      USING ERRCODE = '42501';
  END IF;

  NEW."lastActiveDay" := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  RETURN NEW;
END;
$$;

CREATE TRIGGER member_space_activity_guard
  BEFORE INSERT OR UPDATE ON "MemberSpaceActivity"
  FOR EACH ROW EXECUTE FUNCTION safespace_private.guard_member_space_activity();

-- A member may always see their own retained aggregate, including while
-- suspended for account portability. Other rows require current effective
-- space-administrator access; ordinary members and moderators never gain a
-- roster/activity view.
CREATE POLICY member_space_activity_select ON "MemberSpaceActivity" FOR SELECT
  USING (
    "userId" = safespace_private.current_user_id()
    OR safespace_private.is_space_admin("spaceId")
  );

-- Writes are self-only and need an actual membership that is not suspended.
-- Read-only members and restrictions are intentionally included: recording an
-- activity day does not alter shared content.
CREATE POLICY member_space_activity_insert ON "MemberSpaceActivity" FOR INSERT
  WITH CHECK (
    "userId" = safespace_private.current_user_id()
    AND safespace_private.active_discipline_kind(
      "spaceId", safespace_private.current_user_id()
    ) IS DISTINCT FROM 'suspension'
    AND EXISTS (
      SELECT 1
      FROM "UserSpaceMembership" membership
      WHERE membership."userId" = safespace_private.current_user_id()
        AND membership."spaceId" = "MemberSpaceActivity"."spaceId"
    )
  );

CREATE POLICY member_space_activity_update ON "MemberSpaceActivity" FOR UPDATE
  USING (
    "userId" = safespace_private.current_user_id()
    AND safespace_private.active_discipline_kind(
      "spaceId", safespace_private.current_user_id()
    ) IS DISTINCT FROM 'suspension'
  )
  WITH CHECK (
    "userId" = safespace_private.current_user_id()
    AND safespace_private.active_discipline_kind(
      "spaceId", safespace_private.current_user_id()
    ) IS DISTINCT FROM 'suspension'
    AND EXISTS (
      SELECT 1
      FROM "UserSpaceMembership" membership
      WHERE membership."userId" = safespace_private.current_user_id()
        AND membership."spaceId" = "MemberSpaceActivity"."spaceId"
    )
  );
