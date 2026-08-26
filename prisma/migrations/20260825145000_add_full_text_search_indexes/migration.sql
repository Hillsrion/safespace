-- PostgreSQL full-text indexes backing the authenticated search palette.
-- The `simple` dictionary is intentional: reports and handles are multilingual
-- and proper nouns must not be stemmed using a single locale.
CREATE INDEX "Post_description_fts_idx"
  ON "Post" USING GIN (to_tsvector('simple', COALESCE(description, '')));

CREATE INDEX "ReportedEntity_name_fts_idx"
  ON "ReportedEntity" USING GIN (to_tsvector('simple', COALESCE(name, '')));

CREATE INDEX "ReportedEntityHandle_handle_fts_idx"
  ON "ReportedEntityHandle" USING GIN (
    to_tsvector('simple', COALESCE(handle, ''))
  );
