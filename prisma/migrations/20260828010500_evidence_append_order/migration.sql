-- Positions are ordering keys, not attachment counts. A deleted item can leave
-- a gap; appending must still sort after the remaining evidence. The upload
-- service continues to enforce at most ten attachments independently.
ALTER TABLE public."Media" DROP CONSTRAINT "Media_sortOrder_check";
ALTER TABLE public."Media" ADD CONSTRAINT "Media_sortOrder_check" CHECK ("sortOrder" >= 0);
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'media_update';
