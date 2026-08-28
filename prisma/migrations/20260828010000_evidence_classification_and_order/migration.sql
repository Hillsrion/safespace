ALTER TABLE public."Media"
  ADD COLUMN "evidenceCategory" TEXT NOT NULL DEFAULT 'unclassified',
  ADD COLUMN caption VARCHAR(280),
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Media_evidenceCategory_check"
    CHECK ("evidenceCategory" IN ('unclassified', 'photo', 'conversation', 'document', 'recording', 'other')),
  ADD CONSTRAINT "Media_sortOrder_check" CHECK ("sortOrder" >= 0),
  ADD CONSTRAINT "Media_caption_trimmed_check" CHECK (caption IS NULL OR caption = btrim(caption));

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY "postId" ORDER BY "createdAt", id) - 1 AS position
  FROM public."Media"
)
UPDATE public."Media" media SET "sortOrder" = ordered.position FROM ordered WHERE media.id = ordered.id;

CREATE INDEX "Media_postId_sortOrder_id_idx" ON public."Media"("postId", "sortOrder", id);
