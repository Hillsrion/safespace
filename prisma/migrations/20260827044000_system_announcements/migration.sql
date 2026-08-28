CREATE TABLE "SystemAnnouncement" (
  id UUID PRIMARY KEY,
  content TEXT NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 4000),
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdByUserId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemAnnouncement_expiry_after_publication"
    CHECK ("expiresAt" IS NULL OR "expiresAt" > "publishedAt")
);
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'system_announcement_create';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'system_announcement_update';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'system_announcement_delete';
CREATE INDEX "SystemAnnouncement_publishedAt_expiresAt_idx"
  ON "SystemAnnouncement" ("publishedAt", "expiresAt");

ALTER TABLE "SystemAnnouncement" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION safespace_private.current_account_exists()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT safespace_private.context_mode() = 'user'
    AND EXISTS (SELECT 1 FROM public."User" WHERE id = safespace_private.current_user_id())
$$;

-- Authenticated users see only announcements active at the database's current
-- UTC timestamp. Super-administrators may also manage drafts and expired rows.
CREATE POLICY system_announcement_select ON "SystemAnnouncement" FOR SELECT USING (
  safespace_private.is_superadmin()
  OR (
    safespace_private.current_account_exists()
    AND "publishedAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    AND ("expiresAt" IS NULL OR "expiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
  )
);
CREATE POLICY system_announcement_insert ON "SystemAnnouncement" FOR INSERT
  WITH CHECK (
    safespace_private.is_superadmin()
    AND "createdByUserId" = safespace_private.current_user_id()
  );
CREATE POLICY system_announcement_update ON "SystemAnnouncement" FOR UPDATE
  USING (safespace_private.is_superadmin())
  WITH CHECK (safespace_private.is_superadmin());
CREATE POLICY system_announcement_delete ON "SystemAnnouncement" FOR DELETE
  USING (safespace_private.is_superadmin());

-- The author is fixed at insert. A nulling update is allowed only for the
-- ON DELETE SET NULL referential action after that account no longer exists.
CREATE FUNCTION safespace_private.guard_system_announcement_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId" THEN
    IF NEW."createdByUserId" IS NULL
      AND OLD."createdByUserId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public."User" WHERE id = OLD."createdByUserId")
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'announcement creator is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER system_announcement_creator_guard BEFORE UPDATE ON "SystemAnnouncement"
  FOR EACH ROW EXECUTE FUNCTION safespace_private.guard_system_announcement_creator();
