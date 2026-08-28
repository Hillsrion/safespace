# Media deletion retry worker

`build/runtime/media-deletion-worker.js` is a separate, production executable
for the private-object deletion outbox. It never runs inside the HTTP process.

Run one bounded pass with `--once`, or a supervised long-running process with
`--loop`. It logs only fixed event codes and counts; it does not log storage
keys, provider responses, database URLs, or exception messages. `SIGTERM` and
`SIGINT` stop claiming after the current object and disconnect from PostgreSQL.
`--once` returns exit code 1 if a deletion fails or a lease completion is lost.

The worker requires `MEDIA_DELETION_WORKER_DATABASE_URL`. It refuses to start
when `DATABASE_URL`, `SYSTEM_DATABASE_URL`, or `SESSION_SECRET` is present.
Provide R2 credentials restricted to the private bucket and the minimum
permissions supported by the provider. The application only performs DELETE;
do not assume the provider offers a DELETE-only credential scope.

| Variable | Default | Bound |
| --- | --- | --- |
| `MEDIA_DELETION_WORKER_BATCH_SIZE` | 25 | 1–100 |
| `MEDIA_DELETION_WORKER_CADENCE_MS` | 60000 | 1000–3600000 |
| `MEDIA_DELETION_WORKER_ERROR_BACKOFF_MS` | 30000 | 1000–3600000 |
| `MEDIA_DELETION_WORKER_STORAGE_TIMEOUT_MS` | 30000 | 1000–120000 |
| `MEDIA_DELETION_WORKER_SHUTDOWN_TIMEOUT_MS` | 150000 | 1000–180000 |

## Database boundary

Migration `20260827043000_media_deletion_worker_boundary` creates a closed
`safespace_worker` interface. It deliberately does **not** create a login role:
the DBA creates and stores that credential outside the repository.

**Before applying this migration to an existing deployment, explicitly reapply
the web role's `USAGE` and `EXECUTE` grants from
`database-row-level-security.md`.** The migration removes `PUBLIC` access to
`safespace_private` so a worker cannot call context-derived `SECURITY DEFINER`
helpers. It cannot safely automate grants for an installation-specific role.

```sql
CREATE ROLE safespace_media_deletion_worker LOGIN PASSWORD 'replace-me'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT CONNECT ON DATABASE safespace TO safespace_media_deletion_worker;
GRANT USAGE ON SCHEMA safespace_worker TO safespace_media_deletion_worker;
GRANT EXECUTE ON FUNCTION safespace_worker.claim_media_deletion_jobs(integer)
  TO safespace_media_deletion_worker;
GRANT EXECUTE ON FUNCTION safespace_worker.complete_media_deletion_job(uuid, uuid)
  TO safespace_media_deletion_worker;
GRANT EXECUTE ON FUNCTION safespace_worker.fail_media_deletion_job(uuid, uuid, text)
  TO safespace_media_deletion_worker;
```

Grant nothing on `public` tables or `safespace_private`, and do not grant role
membership. The worker functions require the exact `session_user`, lease each
row with `FOR UPDATE SKIP LOCKED`, and can only claim, complete, or record one
of three fixed failure codes. This avoids the dangerous alternative of setting
`safespace.user_id` from `requestedByUserId`: the application helper functions
are `SECURITY DEFINER` and would otherwise make a forged context meaningful.

Also revoke PostgreSQL's default schema creation privilege before provisioning:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA safespace_worker FROM PUBLIC;
```

The worker leases one row immediately before each storage call; the three-minute
lease exceeds the maximum 120-second storage timeout. It never pre-leases a
large batch that could expire while earlier objects are being deleted.

The storage deadline aborts the R2 `fetch` with an `AbortSignal`. A request
whose outcome is unknown is left in the outbox and may be retried; DELETE is
idempotent, so this is safer than assuming an interrupted request failed.

## Production executable and supervision

```sh
npm run build
node build/runtime/media-deletion-worker.js --help
docker build --target media-deletion-worker -t safespace-media-worker .
docker run --rm --stop-timeout 160 --env-file /secure/path/media-worker.env safespace-media-worker
# A scheduled bounded run instead of the default --loop:
docker run --rm --env-file /secure/path/media-worker.env safespace-media-worker node build/runtime/media-deletion-worker.js --once
```

The environment file is separate from web and migration secrets. Set the R2
variables documented in `secure-media-pipeline.md`. No HTTP port or web
healthcheck is part of this target. Supervise process exits and cycle counters;
monitor outbox age with a separately authorized operator connection. A running
process alone does not prove R2 availability or that the queue is draining.

Allow more time for container shutdown than the configured worker deadline
(160 seconds for the default 150 seconds). Leases expire after three minutes;
an interrupted delete may run again safely. Failed jobs use a 30-second
exponential delay capped at 7,680 seconds, without silently discarding jobs.

CI runs the real PostgreSQL boundary verifier, builds the worker container and
runs `--once` against an empty outbox as its restricted role. Local unit tests
cover failed deletion, lost completion, polling, cancellation, and safe logs.
Actual provider deletion and production scheduling still require an operational
smoke test with the deployed bucket and credentials.
