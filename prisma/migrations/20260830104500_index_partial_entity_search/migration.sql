-- Substring matching is part of the entity search contract. Full-text GIN
-- indexes cannot accelerate a leading-wildcard LIKE predicate, so keep that
-- fallback explicitly indexed as well.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE INDEX "ReportedEntity_name_trgm_idx"
  ON "ReportedEntity" USING GIN (lower(name) gin_trgm_ops);

CREATE INDEX "ReportedEntityHandle_handle_trgm_idx"
  ON "ReportedEntityHandle" USING GIN (lower(handle) gin_trgm_ops);
