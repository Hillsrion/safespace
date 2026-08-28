import { PrismaClient } from "../app/generated/prisma";
import { fileURLToPath } from "node:url";
import { deleteMediaObjectWithTimeout, mediaDeletionErrorCode } from "../app/services/media-deletion-utils.server";
import { getMediaStorage } from "../app/services/media-storage.server";

type Mode = "once" | "loop";
export type WorkerConfig = { batchSize: number; cadenceMs: number; errorBackoffMs: number; mode: Mode; shutdownTimeoutMs: number; storageTimeoutMs: number; url: string };
type ClaimedJob = { job_id: string; storage_key: string; lease_token: string };

function boundedInteger(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  const resolved = value?.trim() ? Number(value) : fallback;
  if (!Number.isInteger(resolved) || resolved < min || resolved > max) throw new Error(`${name} is invalid`);
  return resolved;
}

export function workerConfig(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const flags = argv.slice(2);
  const mode: Mode | undefined = flags.length === 1 && flags[0] === "--once" ? "once" : flags.length === 1 && flags[0] === "--loop" ? "loop" : undefined;
  if (!mode) throw new Error("usage: media-deletion-worker --once|--loop");
  if (env.DATABASE_URL?.trim() || env.SYSTEM_DATABASE_URL?.trim() || env.SESSION_SECRET?.trim()) {
    throw new Error("worker must not receive web, session, or owner database secrets");
  }
  const url = env.MEDIA_DELETION_WORKER_DATABASE_URL?.trim();
  if (!url) throw new Error("MEDIA_DELETION_WORKER_DATABASE_URL is required");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("MEDIA_DELETION_WORKER_DATABASE_URL is invalid"); }
  const schemas = parsed.searchParams.getAll("schema");
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || schemas.some((schema) => schema !== "public") || (schemas[0] ?? "public") !== "public") {
    throw new Error("MEDIA_DELETION_WORKER_DATABASE_URL must be a PostgreSQL public-schema URL");
  }
  return {
    mode, url,
    batchSize: boundedInteger("MEDIA_DELETION_WORKER_BATCH_SIZE", env.MEDIA_DELETION_WORKER_BATCH_SIZE, 25, 1, 100),
    cadenceMs: boundedInteger("MEDIA_DELETION_WORKER_CADENCE_MS", env.MEDIA_DELETION_WORKER_CADENCE_MS, 60_000, 1_000, 3_600_000),
    errorBackoffMs: boundedInteger("MEDIA_DELETION_WORKER_ERROR_BACKOFF_MS", env.MEDIA_DELETION_WORKER_ERROR_BACKOFF_MS, 30_000, 1_000, 3_600_000),
    shutdownTimeoutMs: boundedInteger("MEDIA_DELETION_WORKER_SHUTDOWN_TIMEOUT_MS", env.MEDIA_DELETION_WORKER_SHUTDOWN_TIMEOUT_MS, 150_000, 1_000, 180_000),
    storageTimeoutMs: boundedInteger("MEDIA_DELETION_WORKER_STORAGE_TIMEOUT_MS", env.MEDIA_DELETION_WORKER_STORAGE_TIMEOUT_MS, 30_000, 1_000, 120_000),
  };
}

function log(code: string, counters: Record<string, number> = {}): void {
  console.log(JSON.stringify({ event: code, ...counters }));
}

export async function verifyWorkerRole(client: PrismaClient): Promise<void> {
  const [role] = await client.$queryRaw<Array<{ inheritedRoles: bigint; name: string; owner: boolean; privateUsage: boolean; publicDataAccess: boolean; publicCreate: boolean; workerCreate: boolean; rolbypassrls: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolinherit: boolean; rolsuper: boolean }>>`
    SELECT r.rolname AS name, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolinherit,
      EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND pg_has_role(current_user, c.relowner, 'MEMBER')) AS owner
      , has_schema_privilege(session_user, 'safespace_private', 'USAGE') AS "privateUsage"
      , has_schema_privilege(session_user, 'public', 'CREATE') AS "publicCreate"
      , has_schema_privilege(session_user, 'safespace_worker', 'CREATE') AS "workerCreate"
      , EXISTS (
          SELECT 1 FROM pg_class c
          WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
            AND (has_table_privilege(session_user, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
              OR has_any_column_privilege(session_user, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
        ) AS "publicDataAccess"
      , (SELECT count(*) FROM pg_auth_members m WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = session_user)) AS "inheritedRoles"
    FROM pg_roles r WHERE r.rolname = session_user
  `;
  if (!role || role.name !== "safespace_media_deletion_worker" || role.owner || role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole || role.rolinherit || role.privateUsage || role.publicCreate || role.workerCreate || role.publicDataAccess || role.inheritedRoles !== 0n) {
    throw new Error("worker database role is privileged");
  }
}

export async function processBatch(client: PrismaClient, config: WorkerConfig, stopping: () => boolean): Promise<{ claimed: number; deleted: number; failed: number }> {
  let storage: ReturnType<typeof getMediaStorage> | undefined;
  let storageError: unknown;
  try { storage = getMediaStorage(); } catch (error) { storageError = error; }
  let claimed = 0;
  let deleted = 0;
  let failed = 0;
  // Lease one job immediately before deleting it. A 3-minute lease therefore
  // covers the 120-second storage deadline even at the maximum batch size.
  for (let index = 0; index < config.batchSize; index += 1) {
    if (stopping()) break;
    const [job] = await client.$queryRaw<ClaimedJob[]>`SELECT * FROM safespace_worker.claim_media_deletion_jobs(1)`;
    if (!job) break;
    claimed += 1;
    try {
      if (storageError) throw storageError;
      if (!storage) throw new Error("storage unavailable");
      await deleteMediaObjectWithTimeout(storage, job.storage_key, config.storageTimeoutMs);
      const [completion] = await client.$queryRaw<Array<{ complete_media_deletion_job: boolean }>>`
        SELECT safespace_worker.complete_media_deletion_job(${job.job_id}::uuid, ${job.lease_token}::uuid)
      `;
      if (completion?.complete_media_deletion_job) deleted += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      const errorCode = mediaDeletionErrorCode(error);
      await client.$queryRaw`SELECT safespace_worker.fail_media_deletion_job(${job.job_id}::uuid, ${job.lease_token}::uuid, ${errorCode})`;
    }
  }
  return { claimed, deleted, failed };
}

export const wait = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  if (signal.aborted) { resolve(); return; }
  const stop = () => { clearTimeout(timeout); resolve(); };
  const timeout = setTimeout(() => { signal.removeEventListener("abort", stop); resolve(); }, milliseconds);
  signal.addEventListener("abort", stop, { once: true });
});

export async function main(argv = process.argv, env = process.env): Promise<void> {
  if (argv.slice(2).length === 1 && argv[2] === "--help") {
    console.log("usage: media-deletion-worker --once|--loop");
    return;
  }
  const config = workerConfig(argv, env);
  const client = new PrismaClient({ datasourceUrl: config.url, log: [] });
  let stopping = false;
  const shutdown = new AbortController();
  let shutdownDeadline: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    shutdown.abort();
    shutdownDeadline = setTimeout(() => {
      console.error("media_deletion_worker_shutdown_deadline_exceeded");
      process.exit(1);
    }, config.shutdownTimeoutMs);
    shutdownDeadline.unref?.();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    await verifyWorkerRole(client);
    do {
      let delayMs = config.cadenceMs;
      try {
        const result = await processBatch(client, config, () => stopping);
        log("media_deletion_worker_cycle", result);
        if (config.mode === "once" && result.failed > 0) process.exitCode = 1;
      } catch { log("media_deletion_worker_cycle_failed"); delayMs = config.errorBackoffMs; if (config.mode === "once") process.exitCode = 1; }
      if (config.mode === "loop" && !stopping) await wait(delayMs, shutdown.signal);
    } while (config.mode === "loop" && !stopping);
    log("media_deletion_worker_stopped");
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    await client.$disconnect();
    if (shutdownDeadline) clearTimeout(shutdownDeadline);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => { console.error("media_deletion_worker_start_failed"); process.exitCode = 1; });
}
