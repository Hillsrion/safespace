-- Entity creation may be caused by an anonymous report. Keeping the creator
-- mandatory would expose that report's author and block account deletion.
ALTER TABLE "ReportedEntity"
DROP CONSTRAINT "ReportedEntity_addedByUserId_fkey";

ALTER TABLE "ReportedEntity"
ALTER COLUMN "addedByUserId" DROP NOT NULL;

ALTER TABLE "ReportedEntity"
ADD CONSTRAINT "ReportedEntity_addedByUserId_fkey"
FOREIGN KEY ("addedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
