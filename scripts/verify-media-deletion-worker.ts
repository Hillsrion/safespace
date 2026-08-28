/**
 * Real PostgreSQL boundary check. This deliberately accepts only an explicit
 * disposable-test admin URL; it never falls back to DATABASE_URL.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "../app/generated/prisma";
import { verifyWorkerRole } from "../server/media-deletion-worker";

const role = "safespace_media_deletion_worker";
const password = randomBytes(32).toString("hex");
const workerKey = `evidence/v1/${"a".repeat(43)}.jpg`;

async function cleanupRole(admin: PrismaClient, database: string): Promise<void> {
  const [exists] = await admin.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role}) AS exists
  `;
  if (!exists?.exists) return;
  await admin.$executeRawUnsafe(`REVOKE ALL PRIVILEGES ON DATABASE "${database.replaceAll('"', '""')}" FROM ${role}`);
  await admin.$executeRawUnsafe(`REVOKE ALL ON SCHEMA safespace_worker FROM ${role}`);
  await admin.$executeRawUnsafe(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA safespace_worker FROM ${role}`);
  await admin.$executeRawUnsafe(`DROP ROLE ${role}`);
}

async function main(): Promise<void> {
  assert.equal(process.env.NODE_ENV, "test", "NODE_ENV=test is required");
  assert.equal(process.env.RLS_TEST_ALLOW_SETUP, "1", "RLS_TEST_ALLOW_SETUP=1 is required");
  const adminUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL;
  assert.ok(adminUrl, "RLS_TEST_ADMIN_DATABASE_URL is required; DATABASE_URL is not used");
  const parsed = new URL(adminUrl);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol), "PostgreSQL URL required");
  const admin = new PrismaClient({ datasourceUrl: adminUrl, log: [] });
  let worker: PrismaClient | undefined;
  let database = "";
  let fixtureUserId: string | undefined;
  let fixtureSpaceId: string | undefined;
  let referencedKey: string | undefined;
  const jobIds: string[] = [];
  let createdRole = false;
  try {
    [{ database }] = await admin.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
    const [existingRole] = await admin.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${role}) AS exists`;
    assert.equal(existingRole.exists, false, "refusing to replace an existing worker role; use a disposable PostgreSQL cluster");
    await admin.$executeRawUnsafe("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await admin.$executeRawUnsafe(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    createdRole = true;
    await admin.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${database.replaceAll('"', '""')}" TO ${role}`);
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA safespace_worker TO ${role}`);
    await admin.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION safespace_worker.claim_media_deletion_jobs(integer) TO ${role}`);
    await admin.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION safespace_worker.complete_media_deletion_job(uuid, uuid) TO ${role}`);
    await admin.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION safespace_worker.fail_media_deletion_job(uuid, uuid, text) TO ${role}`);
    parsed.username = role;
    parsed.password = password;
    parsed.searchParams.set("connection_limit", "1");
    worker = new PrismaClient({ datasourceUrl: parsed.toString(), log: [] });

    await expectWorkerSafe(worker);
    await admin.$executeRawUnsafe(`GRANT SELECT ON public."User" TO ${role}`);
    try { await assert.rejects(verifyWorkerRole(worker), /privileged/); }
    finally { await admin.$executeRawUnsafe(`REVOKE SELECT ON public."User" FROM ${role}`); }
    await expectWorkerSafe(worker);
    await assert.rejects(worker.$queryRaw`SELECT * FROM public."MediaDeletionJob"`);
    await assert.rejects(worker.$queryRaw`SELECT safespace_private.current_user_id()`);
    await worker.$executeRaw`SELECT set_config('safespace.user_id', ${randomUUID()}, false)`;
    await worker.$executeRaw`SELECT set_config('TimeZone', 'Pacific/Auckland', false)`;
    await assert.rejects(worker.$queryRaw`SELECT * FROM public."MediaDeletionJob"`);
    await assert.rejects(worker.$queryRaw`SELECT * FROM safespace_worker.claim_media_deletion_jobs(${null}::integer)`);

    const key = `${workerKey.slice(0, -4)}-${randomUUID().slice(0, 4)}.jpg`;
    const [job] = await admin.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO public."MediaDeletionJob" ("storageKey") VALUES (${key}) RETURNING id
    `);
    jobIds.push(job.id);
    const claimed = await worker.$queryRaw<Array<{ job_id: string; lease_token: string }>>`
      SELECT * FROM safespace_worker.claim_media_deletion_jobs(1)
    `;
    const lease = claimed.find(({ job_id }) => job_id === job.id);
    assert.ok(lease, "worker should claim only through its bounded function");
    const [wrongCompletion] = await worker.$queryRaw<Array<{ complete_media_deletion_job: boolean }>>`SELECT safespace_worker.complete_media_deletion_job(${job.id}::uuid, ${randomUUID()}::uuid)`;
    assert.equal(wrongCompletion.complete_media_deletion_job, false, "another lease cannot complete this job");
    assert.equal((await worker.$queryRaw<Array<unknown>>`SELECT * FROM safespace_worker.claim_media_deletion_jobs(1)`).length, 0, "an active lease must not be claimed twice");
    const [leaseTiming] = await admin.$queryRaw<Array<{ seconds: number }>>(Prisma.sql`
      SELECT EXTRACT(EPOCH FROM ("leaseExpiresAt" - (clock_timestamp() AT TIME ZONE 'UTC'))) AS seconds
      FROM public."MediaDeletionJob" WHERE id = ${job.id}::uuid
    `);
    assert.ok(leaseTiming.seconds > 170 && leaseTiming.seconds <= 180, "lease timestamps must be UTC wall-clock values");
    await assert.rejects(worker.$queryRaw`SELECT safespace_worker.fail_media_deletion_job(${lease.job_id}::uuid, ${lease.lease_token}::uuid, 'raw provider message')`);
    await assert.rejects(worker.$queryRaw`SELECT safespace_worker.fail_media_deletion_job(${lease.job_id}::uuid, ${lease.lease_token}::uuid, ${null}::text)`);
    const [failed] = await worker.$queryRaw<Array<{ fail_media_deletion_job: boolean }>>`SELECT safespace_worker.fail_media_deletion_job(${job.id}::uuid, ${lease.lease_token}::uuid, 'storage_timeout')`;
    assert.equal(failed.fail_media_deletion_job, true);
    const retry = await admin.mediaDeletionJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(retry.attempts, 1);
    assert.equal(retry.lastError, "storage_timeout");
    assert.equal(retry.leaseToken, null);
    assert.equal((await worker.$queryRaw<Array<unknown>>`SELECT * FROM safespace_worker.claim_media_deletion_jobs(1)`).length, 0, "failure backoff must postpone the next claim");
    await admin.mediaDeletionJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
    const [retryLease] = await worker.$queryRaw<Array<{ job_id: string; lease_token: string }>>`SELECT * FROM safespace_worker.claim_media_deletion_jobs(1)`;
    assert.equal(retryLease.job_id, job.id);
    assert.notEqual(retryLease.lease_token, lease.lease_token);
    const [staleCompletion] = await worker.$queryRaw<Array<{ complete_media_deletion_job: boolean }>>`SELECT safespace_worker.complete_media_deletion_job(${job.id}::uuid, ${lease.lease_token}::uuid)`;
    assert.equal(staleCompletion.complete_media_deletion_job, false, "previous leases must be fenced out");
    const [completed] = await worker.$queryRaw<Array<{ complete_media_deletion_job: boolean }>>`
      SELECT safespace_worker.complete_media_deletion_job(${retryLease.job_id}::uuid, ${retryLease.lease_token}::uuid)
    `;
    assert.equal(completed.complete_media_deletion_job, true);
    const remaining = await admin.mediaDeletionJob.findUnique({ where: { id: job.id } });
    assert.equal(remaining, null);
    fixtureUserId = randomUUID();
    fixtureSpaceId = randomUUID();
    const fixtureEntityId = randomUUID();
    const fixturePostId = randomUUID();
    referencedKey = `evidence/v1/${"b".repeat(39)}${randomUUID().replaceAll('-', '').slice(0, 4)}.jpg`;
    await admin.user.create({ data: { id: fixtureUserId, email: `worker-${fixtureUserId}@test.invalid`, password: "unused", firstName: "Worker", lastName: "Fixture" } });
    await admin.space.create({ data: { id: fixtureSpaceId, name: `worker-${fixtureSpaceId}`, createdBy: fixtureUserId } });
    await admin.reportedEntity.create({ data: { id: fixtureEntityId, name: "Worker fixture", spaceId: fixtureSpaceId, addedByUserId: fixtureUserId } });
    await admin.post.create({ data: { id: fixturePostId, spaceId: fixtureSpaceId, authorId: fixtureUserId, reportedEntityId: fixtureEntityId, description: "fixture" } });
    await admin.media.create({ data: { id: randomUUID(), postId: fixturePostId, uploaderId: fixtureUserId, storageKey: referencedKey, fileName: "fixture.jpg", mimeType: "image/jpeg", fileSize: 1 } });
    await admin.mediaDeletionJob.create({ data: { storageKey: referencedKey } });
    const excluded = await worker.$queryRaw<Array<{ job_id: string }>>`SELECT * FROM safespace_worker.claim_media_deletion_jobs(1)`;
    assert.equal(excluded.some(({ job_id }) => job_id === job.id), false);
    assert.equal(excluded.length, 0, "a key still referenced by Media must not be claimed");
    await admin.mediaDeletionJob.deleteMany({ where: { storageKey: referencedKey } });
    console.log("PASS media deletion worker has no table/helper access and can only use leased outbox functions");
  } finally {
    await worker?.$disconnect();
    if (jobIds.length) await admin.mediaDeletionJob.deleteMany({ where: { id: { in: jobIds } } });
    if (referencedKey) await admin.mediaDeletionJob.deleteMany({ where: { storageKey: referencedKey } });
    if (fixtureSpaceId) await admin.space.deleteMany({ where: { id: fixtureSpaceId } });
    if (fixtureUserId) await admin.user.deleteMany({ where: { id: fixtureUserId } });
    if (createdRole) await cleanupRole(admin, database);
    await admin.$disconnect();
  }
}

async function expectWorkerSafe(worker: PrismaClient): Promise<void> {
  await assert.doesNotReject(verifyWorkerRole(worker));
}

main().catch(() => { console.error("FAIL media deletion worker boundary"); process.exitCode = 1; });
