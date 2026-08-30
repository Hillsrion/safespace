#!/usr/bin/env bash
set -euo pipefail

if [[ "${BACKUP_TEST_ALLOW_SETUP:-}" != "1" ]]; then
  echo "Refusing backup drill without BACKUP_TEST_ALLOW_SETUP=1" >&2
  exit 2
fi

source_url="${BACKUP_TEST_SOURCE_DATABASE_URL:-}"
maintenance_url="${BACKUP_TEST_MAINTENANCE_DATABASE_URL:-}"
restore_url="${BACKUP_TEST_RESTORE_DATABASE_URL:-}"
restore_database="${BACKUP_TEST_RESTORE_DATABASE_NAME:-}"

if [[ -z "$source_url" || -z "$maintenance_url" || -z "$restore_url" ]]; then
  echo "Backup drill database URLs are required" >&2
  exit 2
fi
if [[ ! "$restore_database" =~ ^safespace_restore_[a-z0-9_]+$ ]]; then
  echo "Restore database name must use the safespace_restore_ prefix" >&2
  exit 2
fi

actual_source="$(psql "$source_url" -Atqc 'SELECT current_database()')"
actual_maintenance="$(psql "$maintenance_url" -Atqc 'SELECT current_database()')"
if [[ -z "$actual_source" || "$actual_source" == "$restore_database" ]]; then
  echo "Source and restore databases must be distinct" >&2
  exit 2
fi
if [[ "$actual_maintenance" == "$restore_database" ]]; then
  echo "Maintenance connection cannot target the restore database" >&2
  exit 2
fi

drill_directory="$(mktemp -d)"
dump_path="$drill_directory/safespace.dump"

drop_restore_database() {
  psql "$maintenance_url" --set ON_ERROR_STOP=1 \
    --set restore_database="$restore_database" <<'SQL' >/dev/null
SELECT format('DROP DATABASE IF EXISTS %I WITH (FORCE)', :'restore_database') \gexec
SQL
}

cleanup() {
  drop_restore_database || true
  rm -rf "$drill_directory"
}
trap cleanup EXIT

drop_restore_database
pg_dump "$source_url" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$dump_path"
test -s "$dump_path"

psql "$maintenance_url" --set ON_ERROR_STOP=1 \
  --set restore_database="$restore_database" <<'SQL' >/dev/null
SELECT format('CREATE DATABASE %I', :'restore_database') \gexec
SQL

actual_restore="$(psql "$restore_url" -Atqc 'SELECT current_database()')"
if [[ "$actual_restore" != "$restore_database" ]]; then
  echo "Restore URL targets an unexpected database" >&2
  exit 2
fi

# Debian can ship a newer PostgreSQL client than the target server. Newer dumps
# may include a harmless session setting unknown to an older server (PG17's
# transaction_timeout is one example). Render the custom archive through the
# matching psql client, removing only that exact compatibility-only SET line;
# pipefail and ON_ERROR_STOP still make archive or restore errors fatal.
pg_restore \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --file=- \
  "$dump_path" \
  | sed '/^SET transaction_timeout = 0;$/d' \
  | psql "$restore_url" --set ON_ERROR_STOP=1 --single-transaction >/dev/null

schema_fingerprint_sql="
SELECT json_build_object(
  'migrations', (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL),
  'migrationFingerprint', (SELECT md5(coalesce(string_agg(migration_name || ':' || checksum, ',' ORDER BY migration_name), '')) FROM public._prisma_migrations WHERE finished_at IS NOT NULL),
  'tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'),
  'indexes', (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'),
  'indexFingerprint', (SELECT md5(coalesce(string_agg(indexname || ':' || indexdef, ',' ORDER BY indexname), '')) FROM pg_indexes WHERE schemaname = 'public'),
  'extensionFingerprint', (SELECT md5(coalesce(string_agg(e.extname || ':' || e.extversion || ':' || n.nspname, ',' ORDER BY e.extname), '')) FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace),
  'rlsTables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity),
  'policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
  'privateFunctions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('safespace_private', 'safespace_worker'))
)::text;
"

source_fingerprint="$(psql "$source_url" -Atqc "$schema_fingerprint_sql")"
restore_fingerprint="$(psql "$restore_url" -Atqc "$schema_fingerprint_sql")"
if [[ "$source_fingerprint" != "$restore_fingerprint" ]]; then
  echo "Restored schema security fingerprint differs from source" >&2
  echo "source:  $source_fingerprint" >&2
  echo "restore: $restore_fingerprint" >&2
  exit 1
fi

restore_rls_count="$(psql "$restore_url" -Atqc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity")"
if [[ "$restore_rls_count" -lt 1 ]]; then
  echo "Restored database has no RLS-enabled application tables" >&2
  exit 1
fi

echo "Backup/restore drill passed: $source_fingerprint"
