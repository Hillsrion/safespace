/**
 * Real PostgreSQL integration test, not a mock of the Prisma authorization layer.
 * Run only against a disposable, fully migrated database; see the RLS guide.
 * The administrative connection creates fixtures/grants and observes outcomes.
 * Every behavior under test uses a separate LOGIN, non-owner, NOBYPASSRLS role.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { PrismaClient, Prisma } from "../app/generated/prisma";
import { MissingDbContextError, runWithDbContext } from "../app/db/context.server";
import { createContextualPrismaClient } from "../app/db/contextual-client.server";
import { leaveSpace } from "../app/services/member-lifecycle.server";
import type { MediaStorage } from "../app/services/media-storage.server";

type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type Actor = { id: string; isSuperAdmin?: boolean };
type Scenario = {
  name: string;
  kind: "warning" | "restriction" | "suspension";
  status: "active" | "revoked";
  expiresAt: Date | null;
  canRead: boolean;
  canWrite: boolean;
  role: "ADMIN" | "MODERATOR";
  id: string;
  actionId: string;
  postId: string;
  mediaId: string;
};

const runId = randomBytes(8).toString("hex");
const role = `safespace_rls_it_${runId}`;
const password = randomBytes(32).toString("hex");
const ids = {
  admin: randomUUID(), moderator: randomUUID(), editor: randomUUID(),
  reader: randomUUID(), outsider: randomUUID(), superadmin: randomUUID(),
  spaceA: randomUUID(), spaceB: randomUUID(), entityA: randomUUID(), entityB: randomUUID(),
  publicPost: randomUUID(), privatePost: randomUUID(), foreignPost: randomUUID(), hiddenPost: randomUUID(),
  publicMedia: randomUUID(), privateMedia: randomUUID(), foreignMedia: randomUUID(), hiddenMedia: randomUUID(),
  flag: randomUUID(), appeal: randomUUID(), targetDiscipline: randomUUID(),
};
const past = new Date(Date.now() - 86_400_000);
const future = new Date(Date.now() + 86_400_000);
const scenarioDefinitions = [
  { name: "active restriction", kind: "restriction", status: "active", expiresAt: future, canRead: true, canWrite: false },
  { name: "indefinite restriction", kind: "restriction", status: "active", expiresAt: null, canRead: true, canWrite: false },
  { name: "active suspension", kind: "suspension", status: "active", expiresAt: future, canRead: false, canWrite: false },
  { name: "indefinite suspension", kind: "suspension", status: "active", expiresAt: null, canRead: false, canWrite: false },
  { name: "expired restriction", kind: "restriction", status: "active", expiresAt: past, canRead: true, canWrite: true },
  { name: "expired suspension", kind: "suspension", status: "active", expiresAt: past, canRead: true, canWrite: true },
  { name: "revoked suspension", kind: "suspension", status: "revoked", expiresAt: future, canRead: true, canWrite: true },
  { name: "warning", kind: "warning", status: "active", expiresAt: null, canRead: true, canWrite: true },
] satisfies Omit<Scenario, "id" | "actionId" | "postId" | "mediaId" | "role">[];
const scenarios: Scenario[] = scenarioDefinitions.map((scenario) => ({
  ...scenario, id: randomUUID(), actionId: randomUUID(), postId: randomUUID(), mediaId: randomUUID(),
  role: scenario.name.startsWith("indefinite") ? "ADMIN" : "MODERATOR",
}));
const departures = (["restriction", "suspension"] as const).flatMap((kind) =>
  (["delete", "anonymize"] as const).map((policy) => ({
    kind, policy, id: randomUUID(), postId: randomUUID(), mediaId: randomUUID(),
    storageKey: `rls-test/${runId}/${randomUUID()}`,
  }))
);
const userIds = [ids.admin, ids.moderator, ids.editor, ids.reader, ids.outsider, ids.superadmin,
  ...scenarios.map(({ id }) => id), ...departures.map(({ id }) => id)];
const spaceIds = [ids.spaceA, ids.spaceB];
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const as = <T>(actor: Actor, operation: () => T): T => runWithDbContext({
  mode: "user", userId: actor.id, isSuperAdmin: actor.isSuperAdmin ?? false,
}, operation);

let passed = 0;
let failed = 0;
let stage = "configuration";

// Do not print database URLs, generated role passwords, or raw Prisma queries.
function describeError(error: unknown): string {
  if (error instanceof assert.AssertionError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.name}: ${error.code} (SQLSTATE ${String(error.meta?.code ?? "n/a")})`;
  }
  return error instanceof Error ? error.name : "Unknown error";
}

async function check(name: string, operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${describeError(error)}`);
  }
}

async function main(): Promise<void> {
  assert.equal(process.env.NODE_ENV, "test", "NODE_ENV=test is required");
  assert.equal(process.env.RLS_TEST_ALLOW_SETUP, "1", "Set RLS_TEST_ALLOW_SETUP=1 only for a disposable database");
  const adminUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL;
  assert.ok(adminUrl, "RLS_TEST_ADMIN_DATABASE_URL is required; DATABASE_URL is deliberately not used as a fallback");
  const parsedUrl = new URL(adminUrl);
  assert.ok(["postgres:", "postgresql:"].includes(parsedUrl.protocol), "A direct PostgreSQL URL is required");
  assert.ok(!parsedUrl.searchParams.has("pgbouncer"), "Use a direct PostgreSQL connection for the integration test");
  assert.equal(parsedUrl.searchParams.get("schema") ?? "public", "public", "SafeSpace migrations and this test use the public schema");
  const admin = new PrismaClient({ datasourceUrl: adminUrl, log: [] });
  let runtime: PrismaClient | undefined;
  let roleCreated = false;
  let fixturesStarted = false;
  try {
    stage = "migration and administrative preflight";
    const [adminRole] = await admin.$queryRaw<{ rolsuper: boolean; database: string }[]>`
      SELECT rolsuper, current_database() AS database FROM pg_roles WHERE rolname = current_user
    `;
    assert.equal(adminRole?.rolsuper, true, "Disposable test setup requires a PostgreSQL superuser; the runtime role will not have this privilege");
    const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
    const migrations = (await readdir(migrationRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).map(({ name }) => name).sort();
    assert.ok(migrations.includes("20260827013000_keep_own_discipline_visible"), "The own-discipline visibility regression migration must be present");
    const applied = await admin.$queryRaw<{ migration_name: string; checksum: string }[]>`
      SELECT migration_name, checksum FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `;
    for (const name of migrations) {
      const sql = await readFile(new URL(`${name}/migration.sql`, migrationRoot));
      const checksum = createHash("sha256").update(sql).digest("hex");
      assert.ok(applied.some((row) => row.migration_name === name && row.checksum === checksum), `Migration missing or changed since deployment: ${name}`);
    }
    console.log(`Verified ${migrations.length} applied migrations, including their checksums`);
    const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const tables = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
    assert.ok(tables.length > 0, "No Prisma models found");

    stage = "isolated runtime role setup";
    // Role/password are generated above, not supplied by input. SQL identifiers
    // cannot be query parameters; all identifiers are quoted consistently.
    await admin.$executeRawUnsafe(`CREATE ROLE ${identifier(role)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    roleCreated = true;
    await admin.$executeRawUnsafe(`GRANT CONNECT ON DATABASE ${identifier(adminRole.database)} TO ${identifier(role)}`);
    await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public, safespace_private TO ${identifier(role)}`);
    await admin.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tables.map((table) => `public.${identifier(table)}`).join(", ")} TO ${identifier(role)}`);
    await admin.$executeRawUnsafe(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA safespace_private TO ${identifier(role)}`);
    parsedUrl.username = role;
    parsedUrl.password = password;
    // A single reused connection makes SET LOCAL context leakage observable.
    parsedUrl.searchParams.set("connection_limit", "1");
    runtime = new PrismaClient({ datasourceUrl: parsedUrl.toString(), log: [] });
    const scoped = createContextualPrismaClient(runtime);
    const direct = runtime;
    const [identity] = await direct.$queryRaw<{
      username: string; rolsuper: boolean; rolbypassrls: boolean;
      rolcreatedb: boolean; rolcreaterole: boolean; rolinherit: boolean;
    }[]>`SELECT current_user AS username, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit
         FROM pg_roles WHERE rolname = current_user`;
    assert.equal(identity?.username, role, "Queries must use the independent runtime LOGIN");
    for (const attribute of ["rolsuper", "rolbypassrls", "rolcreatedb", "rolcreaterole", "rolinherit"] as const) {
      assert.equal(identity[attribute], false, `Runtime ${attribute} must be false`);
    }
    const metadata = await direct.$queryRaw<{ relname: string; relrowsecurity: boolean; owner: string }[]>`
      SELECT relname, relrowsecurity, pg_get_userbyid(relowner) AS owner
      FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
    `;
    for (const table of tables) {
      const row = metadata.find(({ relname }) => relname === table);
      assert.ok(row?.relrowsecurity, `${table} must have RLS enabled`);
      assert.notEqual(row.owner, role, `${table} must not be owned by the runtime role`);
    }
    console.log(`Verified non-owner NOBYPASSRLS LOGIN and RLS on all ${tables.length} Prisma tables`);

    stage = "isolated fixture setup";
    fixturesStarted = true;
    await admin.$transaction(async (tx) => {
      await tx.user.createMany({ data: userIds.map((id) => ({
        id, email: `${runId}-${id}@rls.invalid`, password: "unused-test-password",
        firstName: "RLS", lastName: "Fixture", isSuperAdmin: id === ids.superadmin,
      })) });
      await tx.space.createMany({ data: spaceIds.map((id) => ({ id, name: `rls-${runId}-${id}`, createdBy: ids.admin })) });
      await tx.userSpaceMembership.createMany({ data: [
        { userId: ids.admin, spaceId: ids.spaceA, role: "ADMIN" },
        { userId: ids.moderator, spaceId: ids.spaceA, role: "MODERATOR" },
        { userId: ids.editor, spaceId: ids.spaceA, role: "EDITOR" },
        { userId: ids.reader, spaceId: ids.spaceA, role: "READ_ONLY" },
        { userId: ids.outsider, spaceId: ids.spaceB, role: "EDITOR" },
        ...scenarios.flatMap(({ id, role }) => spaceIds.map((spaceId) => ({ userId: id, spaceId, role }))),
        // Suspended administrators exercise the SECURITY DEFINER last-admin
        // guard: their ordinary roster SELECT cannot see the healthy admin.
        ...departures.map(({ id, kind }) => ({ userId: id, spaceId: ids.spaceA, role: kind === "suspension" ? "ADMIN" : "EDITOR" })),
      ] });
      await tx.reportedEntity.createMany({ data: [
        { id: ids.entityA, name: "RLS entity A", spaceId: ids.spaceA, addedByUserId: ids.admin },
        { id: ids.entityB, name: "RLS entity B", spaceId: ids.spaceB, addedByUserId: ids.outsider },
      ] });
      await tx.reportedEntityHandle.createMany({ data: [
        { reportedEntityId: ids.entityA, handle: `rls-a-${runId}` },
        { reportedEntityId: ids.entityB, handle: `rls-b-${runId}` },
      ] });
      const post = (id: string, authorId: string, spaceId = ids.spaceA, reportedEntityId = ids.entityA) => ({
        id, authorId, spaceId, reportedEntityId, description: "RLS fixture",
      });
      await tx.post.createMany({ data: [
        post(ids.publicPost, ids.editor), { ...post(ids.privatePost, ids.admin), isAdminOnly: true },
        { ...post(ids.hiddenPost, ids.reader), status: "hidden" },
        post(ids.foreignPost, ids.outsider, ids.spaceB, ids.entityB),
        ...scenarios.map(({ id, postId }) => post(postId, id)),
        ...departures.map(({ id, postId }) => post(postId, id)),
      ] });
      const media = (id: string, postId: string, uploaderId: string, storageKey = `rls-test/${runId}/${id}`) => ({
        id, postId, uploaderId, storageKey, fileName: "fixture.jpg", mimeType: "image/jpeg", fileSize: 1,
      });
      await tx.media.createMany({ data: [
        media(ids.publicMedia, ids.publicPost, ids.editor),
        media(ids.privateMedia, ids.privatePost, ids.admin),
        media(ids.hiddenMedia, ids.hiddenPost, ids.reader),
        media(ids.foreignMedia, ids.foreignPost, ids.outsider),
        ...scenarios.map(({ id, postId, mediaId }) => media(mediaId, postId, id)),
        ...departures.map(({ id, postId, mediaId, storageKey }) => media(mediaId, postId, id, storageKey)),
      ] });
      await tx.invite.create({ data: {
        email: `invite-${runId}@rls.invalid`, token: runId, spaceId: ids.spaceB,
        invitedByUserId: ids.outsider, roleToAssign: "EDITOR", expiresAt: future,
      } });
      await tx.postFlag.create({ data: { id: ids.flag, postId: ids.publicPost, flaggerUserId: ids.reader, reason: "RLS fixture", status: "resolved" } });
      await tx.moderationAppeal.create({ data: { id: ids.appeal, spaceId: ids.spaceA, postFlagId: ids.flag, filedByUserId: ids.reader, reason: "RLS fixture" } });
      await tx.disciplinaryAction.createMany({ data: [
        { id: ids.targetDiscipline, spaceId: ids.spaceA, userId: ids.reader, issuedByUserId: ids.admin, kind: "warning", level: 1, reason: "RLS fixture" },
        ...scenarios.map(({ id, actionId, kind, status, expiresAt }) => ({
          id: actionId, spaceId: ids.spaceA, userId: id, issuedByUserId: ids.admin,
          kind, status, expiresAt, level: 1, reason: "RLS fixture",
          ...(status === "revoked" ? { revokedByUserId: ids.admin, revokedAt: past, revocationReason: "Fixture revocation" } : {}),
        })),
        ...departures.map(({ id, kind }) => ({ spaceId: ids.spaceA, userId: id, issuedByUserId: ids.admin, kind, level: 1, reason: "RLS departure fixture" })),
      ] });
      await tx.auditLog.create({ data: { spaceId: ids.spaceB, actorUserId: ids.outsider, action: "post_create", targetEntityId: ids.foreignPost } });
      await tx.savedSearch.create({ data: { userId: ids.outsider, spaceId: ids.spaceB, name: "RLS fixture", query: "fixture" } });
      await tx.mediaDeletionJob.createMany({ data: [
        { storageKey: `rls-test/${runId}/owned-job`, requestedByUserId: ids.outsider, spaceId: ids.spaceB },
        { storageKey: `rls-test/${runId}/system-job` },
      ] });
    }, { timeout: 30_000 });

    // Each mutation check is rolled back even when a broken policy allows it.
    // One negative assertion therefore cannot invalidate subsequent fixtures.
    async function rollback<T>(actor: Actor | null, operation: (tx: TransactionClient) => Promise<T>): Promise<T> {
      const marker = new Error("intentional integration rollback");
      let result!: T;
      const client = actor ? scoped : direct;
      const execute = () => client.$transaction(async (tx) => {
        result = await operation(tx);
        throw marker;
      });
      try {
        await (actor ? as(actor, execute) : execute());
      } catch (error) {
        if (error !== marker) throw error;
      }
      return result;
    }
    async function denied(actor: Actor | null, operation: (tx: TransactionClient) => Promise<number>): Promise<void> {
      try {
        assert.equal(await rollback(actor, operation), 0, "Unauthorized mutation affected a row");
      } catch (error) {
        // Only a genuine RLS/permission SQLSTATE is a denial. FK, validation,
        // syntax, connection and trigger failures must fail the test instead.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" && error.meta?.code === "42501") return;
        throw error;
      }
    }
    const insertPost = (tx: TransactionClient, actorId: string, spaceId = ids.spaceA, entityId = ids.entityA) => tx.$executeRaw`
      INSERT INTO "Post" (id, "spaceId", "authorId", "reportedEntityId", description)
      VALUES (${randomUUID()}::uuid, ${spaceId}::uuid, ${actorId}::uuid, ${entityId}::uuid, 'RLS write test')
    `;
    const issueDiscipline = (tx: TransactionClient, actorId: string) => tx.$executeRaw`
      INSERT INTO "DisciplinaryAction" (id, "spaceId", "userId", "issuedByUserId", kind, level, reason)
      VALUES (${randomUUID()}::uuid, ${ids.spaceA}::uuid, ${ids.reader}::uuid, ${actorId}::uuid, 'warning', 2, 'RLS governance test')
    `;

    stage = "RLS integration checks";
    await check("no context: every model is invisible", async () => {
      for (const table of tables) {
        const [row] = await direct.$queryRawUnsafe<{ count: number }[]>(`SELECT count(*)::int AS count FROM public.${identifier(table)}`);
        assert.equal(row.count, 0, `No-context SELECT leaked ${table}`);
      }
    });
    await check("no context: direct SQL INSERT is denied", () => denied(null, (tx) => insertPost(tx, ids.editor)));
    await check("no context: contextual Prisma fails closed", async () => {
      await assert.rejects(() => scoped.post.findMany(), MissingDbContextError);
    });
    await check("space isolation: Prisma joins and private tables", async () => {
      await as({ id: ids.editor }, async () => {
        assert.ok(await scoped.post.findUnique({ where: { id: ids.publicPost } }));
        assert.equal(await scoped.post.findUnique({ where: { id: ids.foreignPost } }), null);
        assert.equal(await scoped.reportedEntity.count({ where: { spaceId: ids.spaceB } }), 0);
        assert.equal(await scoped.reportedEntityHandle.count({ where: { reportedEntityId: ids.entityB } }), 0);
        assert.equal(await scoped.media.count({ where: { id: ids.foreignMedia } }), 0);
        assert.equal(await scoped.user.count({ where: { id: ids.outsider } }), 0);
        assert.equal(await scoped.invite.count({ where: { spaceId: ids.spaceB } }), 0);
        assert.equal(await scoped.auditLog.count({ where: { spaceId: ids.spaceB } }), 0);
        assert.equal(await scoped.savedSearch.count({ where: { userId: ids.outsider } }), 0);
        assert.equal(await scoped.mediaDeletionJob.count(), 0);
      });
    });
    await check("admin-only posts and media: editor/read-only denied", async () => {
      for (const id of [ids.editor, ids.reader]) await as({ id }, async () => {
        assert.equal(await scoped.post.count({ where: { id: ids.privatePost } }), 0);
        assert.equal(await scoped.media.count({ where: { id: ids.privateMedia } }), 0);
      });
    });
    await check("admin-only posts and media: admin/moderator/superadmin permitted", async () => {
      for (const actor of [{ id: ids.admin }, { id: ids.moderator }, { id: ids.superadmin, isSuperAdmin: true }]) {
        await as(actor, async () => {
          assert.equal(await scoped.post.count({ where: { id: ids.privatePost } }), 1);
          assert.equal(await scoped.media.count({ where: { id: ids.privateMedia } }), 1);
        });
      }
    });
    await check("hidden posts/media: unrelated members denied, author and moderators permitted", async () => {
      await as({ id: ids.editor }, async () => {
        assert.equal(await scoped.post.count({ where: { id: ids.hiddenPost } }), 0);
        assert.equal(await scoped.media.count({ where: { id: ids.hiddenMedia } }), 0);
      });
      for (const actor of [{ id: ids.reader }, { id: ids.admin }, { id: ids.moderator }, { id: ids.superadmin, isSuperAdmin: true }]) {
        await as(actor, async () => {
          assert.equal(await scoped.post.count({ where: { id: ids.hiddenPost } }), 1);
          assert.equal(await scoped.media.count({ where: { id: ids.hiddenMedia } }), 1);
        });
      }
    });
    await check("superadmin scope permits cross-space/system outbox but remains NOBYPASSRLS", async () => {
      await as({ id: ids.superadmin, isSuperAdmin: true }, async () => {
        assert.equal(await scoped.post.count({ where: { id: ids.foreignPost } }), 1);
        assert.equal(await scoped.mediaDeletionJob.count({ where: { storageKey: `rls-test/${runId}/system-job` } }), 1);
      });
    });
    await check("editor can create and edit a post in its own space", async () => {
      assert.equal(await rollback({ id: ids.editor }, (tx) => insertPost(tx, ids.editor)), 1);
      assert.equal(await rollback({ id: ids.editor }, (tx) => tx.$executeRaw`UPDATE "Post" SET description = 'RLS edit' WHERE id = ${ids.publicPost}::uuid`), 1);
    });
    await check("read-only cannot create content", () => denied({ id: ids.reader }, (tx) => insertPost(tx, ids.reader)));
    await check("cross-space INSERT and mismatched entity are denied", async () => {
      await denied({ id: ids.editor }, (tx) => insertPost(tx, ids.editor, ids.spaceB, ids.entityB));
      await denied({ id: ids.editor }, (tx) => insertPost(tx, ids.editor, ids.spaceA, ids.entityB));
    });
    await check("cross-space UPDATE and DELETE are denied", async () => {
      await denied({ id: ids.editor }, (tx) => tx.$executeRaw`UPDATE "Post" SET description = 'RLS edit' WHERE id = ${ids.foreignPost}::uuid`);
      await denied({ id: ids.editor }, (tx) => tx.$executeRaw`DELETE FROM "Post" WHERE id = ${ids.foreignPost}::uuid`);
      await denied({ id: ids.editor }, (tx) => tx.$executeRaw`DELETE FROM "Media" WHERE id = ${ids.foreignMedia}::uuid`);
    });
    await check("healthy moderator may issue discipline against a lower role", async () => {
      assert.equal(await rollback({ id: ids.moderator }, (tx) => issueDiscipline(tx, ids.moderator)), 1);
    });
    await check("editor may not issue discipline", () => denied({ id: ids.editor }, (tx) => issueDiscipline(tx, ids.editor)));

    for (const scenario of scenarios) {
      const actor = { id: scenario.id };
      await check(`${scenario.name}: effective visibility and own disciplinary record`, async () => {
        await as(actor, async () => {
          assert.equal(await scoped.post.count({ where: { id: ids.publicPost } }), Number(scenario.canRead));
          assert.equal(await scoped.media.count({ where: { id: ids.publicMedia } }), Number(scenario.canRead));
          assert.equal(await scoped.post.count({ where: { id: ids.privatePost } }), Number(scenario.canWrite));
          assert.equal(await scoped.media.count({ where: { id: ids.privateMedia } }), Number(scenario.canWrite));
          assert.equal(await scoped.post.count({ where: { id: ids.hiddenPost } }), Number(scenario.canWrite));
          assert.equal(await scoped.media.count({ where: { id: ids.hiddenMedia } }), Number(scenario.canWrite));
          assert.equal(await scoped.disciplinaryAction.count({ where: { id: scenario.actionId } }), 1, "Own discipline must remain visible even during suspension (0130)");
          assert.equal(await scoped.disciplinaryAction.count({ where: { id: ids.targetDiscipline } }), Number(scenario.canWrite));
          assert.equal(await scoped.post.count({ where: { id: ids.foreignPost } }), 1, "Discipline must not cross space boundaries");
        });
      });
      await check(`${scenario.name}: creation/editing and moderation rights`, async () => {
        const mutations = [
          (tx: TransactionClient) => insertPost(tx, actor.id),
          (tx: TransactionClient) => tx.$executeRaw`UPDATE "Post" SET description = 'RLS edit' WHERE id = ${scenario.postId}::uuid`,
          (tx: TransactionClient) => tx.$executeRaw`UPDATE "Post" SET "authorId" = NULL, "isAnonymous" = true, description = 'RLS edit' WHERE id = ${scenario.postId}::uuid`,
          (tx: TransactionClient) => tx.$executeRaw`
            INSERT INTO "Media" (id, "postId", "uploaderId", "storageKey", "fileName", "mimeType", "fileSize")
            VALUES (${randomUUID()}::uuid, ${scenario.postId}::uuid, ${actor.id}::uuid,
              ${`rls-test/${runId}/${randomUUID()}`}, 'fixture.jpg', 'image/jpeg', 1)
          `,
          (tx: TransactionClient) => tx.$executeRaw`UPDATE "Media" SET "isBlurred" = false WHERE id = ${scenario.mediaId}::uuid`,
          (tx: TransactionClient) => tx.$executeRaw`UPDATE "Post" SET status = 'hidden' WHERE id = ${ids.publicPost}::uuid`,
          (tx: TransactionClient) => tx.$executeRaw`DELETE FROM "Post" WHERE id = ${ids.publicPost}::uuid`,
          (tx: TransactionClient) => tx.$executeRaw`DELETE FROM "Media" WHERE id = ${ids.publicMedia}::uuid`,
        ];
        for (const mutate of mutations) {
          if (scenario.canWrite) assert.equal(await rollback(actor, mutate), 1);
          else await denied(actor, mutate);
        }
        assert.equal(await rollback(actor, (tx) => insertPost(tx, actor.id, ids.spaceB, ids.entityB)), 1, "Write access in the unaffected space must remain intact");
      });
      await check(`${scenario.name}: disciplinary and appeal governance`, async () => {
        const mutations = [
          (tx: TransactionClient) => issueDiscipline(tx, actor.id),
          (tx: TransactionClient) => tx.$executeRaw`
            UPDATE "DisciplinaryAction" SET status = 'revoked', "revokedByUserId" = ${actor.id}::uuid,
              "revokedAt" = CURRENT_TIMESTAMP, "revocationReason" = 'RLS governance test'
            WHERE id = ${ids.targetDiscipline}::uuid
          `,
          (tx: TransactionClient) => tx.$executeRaw`
            UPDATE "ModerationAppeal" SET status = 'upheld', "reviewedByUserId" = ${actor.id}::uuid,
              "decidedAt" = CURRENT_TIMESTAMP, "decisionNote" = 'RLS governance test'
            WHERE id = ${ids.appeal}::uuid
          `,
        ];
        for (const mutate of mutations) {
          if (scenario.canWrite) assert.equal(await rollback(actor, mutate), 1);
          else await denied(actor, mutate);
        }
      });
      if (scenario.kind === "restriction" && !scenario.canWrite) {
        await check(`${scenario.name}: own deletion requires the dedicated withdrawal workflow`, async () => {
          await denied(actor, (tx) => tx.$executeRaw`DELETE FROM "Media" WHERE id = ${scenario.mediaId}::uuid`);
          await denied(actor, (tx) => tx.$executeRaw`DELETE FROM "Post" WHERE id = ${scenario.postId}::uuid`);
        });
      }
    }

    await check("withdrawal primitive denies missing or nonexistent identity", async () => {
      for (const actor of [null, { id: randomUUID() }]) {
        await assert.rejects(
          () => rollback(actor, (tx) => tx.$queryRaw`SELECT safespace_private.withdraw_own_contributions(${ids.spaceA}::uuid, 'delete')`),
          (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" && error.meta?.code === "42501"
        );
      }
    });
    await check("withdrawal primitive rejects invalid policy instead of partially cleaning data", async () => {
      await assert.rejects(
        () => rollback({ id: ids.editor }, (tx) => tx.$queryRaw`SELECT safespace_private.withdraw_own_contributions(${ids.spaceA}::uuid, 'invalid')`),
        (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" && error.meta?.code === "22023"
      );
    });
    await check("withdrawal primitive cannot erase or anonymize another space's contributions", async () => {
      for (const policy of ["delete", "anonymize"]) {
        const [result] = await as({ id: ids.editor }, () => scoped.$queryRaw<{ keys: string[] }[]>`
          SELECT safespace_private.withdraw_own_contributions(${ids.spaceB}::uuid, ${policy}::text) AS keys
        `);
        assert.deepEqual(result.keys, []);
        const foreign = await admin.post.findUnique({ where: { id: ids.foreignPost } });
        assert.equal(foreign?.authorId, ids.outsider);
        assert.equal(foreign?.isAnonymous, false);
        assert.equal(await admin.media.count({ where: { id: ids.foreignMedia } }), 1);
        assert.equal(await admin.invite.count({ where: { spaceId: ids.spaceB } }), 1);
      }
    });
    await check("last healthy admin cannot leave; suspended admin can leave without a visible roster", async () => {
      const [result] = await as({ id: ids.admin }, () => scoped.$queryRaw<{ allowed: boolean }[]>`
        SELECT safespace_private.own_membership_can_leave(${ids.spaceA}::uuid) AS allowed
      `);
      assert.equal(result.allowed, false);
      for (const departure of departures.filter(({ kind }) => kind === "suspension")) {
        await as({ id: departure.id }, async () => {
          const roster = await scoped.userSpaceMembership.findMany({ where: { spaceId: ids.spaceA }, select: { userId: true } });
          assert.deepEqual(roster.map(({ userId }) => userId), [departure.id], "Suspended admin must not regain access to the roster");
          const [canLeave] = await scoped.$queryRaw<{ allowed: boolean }[]>`
            SELECT safespace_private.own_membership_can_leave(${ids.spaceA}::uuid) AS allowed
          `;
          assert.equal(canLeave.allowed, true, "The invisible healthy admin must still allow a suspended admin to leave");
        });
      }
    });
    for (const departure of departures) {
      await check(`${departure.kind}: leaveSpace(${departure.policy}) removes identity and storage`, async () => {
        const deletedKeys: string[] = [];
        const storage: MediaStorage = {
          async deleteObject(key) { deletedKeys.push(key); },
          async putObject() { throw new Error("Unexpected object upload"); },
          async getObject() { throw new Error("Unexpected object read"); },
          async createSignedDownloadUrl() { throw new Error("Unexpected signed URL"); },
        };
        await as({ id: departure.id }, () => leaveSpace(
          { id: departure.id }, { spaceId: ids.spaceA, contributionPolicy: departure.policy }, scoped, { storage }
        ));
        // Observe with the fixture owner, never with the newly departed user:
        // hidden-but-still-attributed rows must not look like successful cleanup.
        const remaining = await admin.post.findUnique({ where: { id: departure.postId } });
        if (departure.policy === "delete") assert.equal(remaining, null, "Deleted contribution must really be absent");
        else {
          assert.ok(remaining, "Anonymized contribution must be preserved");
          assert.equal(remaining.authorId, null, "Anonymized contribution must not retain authorId");
          assert.equal(remaining.isAnonymous, true);
        }
        assert.equal(await admin.media.count({ where: { uploaderId: departure.id } }), 0);
        assert.equal(await admin.userSpaceMembership.count({ where: { userId: departure.id, spaceId: ids.spaceA } }), 0);
        assert.deepEqual(deletedKeys, [departure.storageKey], "The private storage object must be deleted through the outbox");
        assert.equal(await admin.mediaDeletionJob.count({ where: { storageKey: departure.storageKey } }), 0);
        assert.equal(await admin.post.count({ where: { id: ids.publicPost, authorId: ids.editor } }), 1, "Departure must not mutate another author's post");
        assert.equal(await admin.media.count({ where: { id: ids.publicMedia } }), 1, "Departure must not remove another uploader's media");
      });
    }
    await check("pooled connection has no identity after success, rollback and leave", async () => {
      await as({ id: ids.superadmin, isSuperAdmin: true }, () => scoped.post.count());
      const [context] = await direct.$queryRaw<{ user_id: string | null; mode: string; is_superadmin: boolean | null }[]>`
        SELECT safespace_private.current_user_id() AS user_id,
          safespace_private.context_mode() AS mode, safespace_private.is_superadmin() AS is_superadmin
      `;
      assert.equal(context.user_id, null);
      assert.equal(context.mode, "none");
      assert.notEqual(context.is_superadmin, true);
      assert.equal(await direct.post.count(), 0);
    });
  } finally {
    await runtime?.$disconnect();
    try {
      if (fixturesStarted) {
        await admin.$transaction(async (tx) => {
          await tx.auditLog.deleteMany({ where: { spaceId: { in: spaceIds } } });
          await tx.mediaDeletionJob.deleteMany({ where: { storageKey: { startsWith: `rls-test/${runId}/` } } });
          // Space cascades remove posts, media, governance, invites and entities.
          await tx.space.deleteMany({ where: { id: { in: spaceIds } } });
          await tx.user.deleteMany({ where: { id: { in: userIds } } });
        }, { timeout: 30_000 });
      }
    } finally {
      try {
        if (roleCreated) {
          // This random role owns no objects. DROP OWNED only revokes its
          // temporary grants, including privileges added by future migrations.
          await admin.$executeRawUnsafe(`DROP OWNED BY ${identifier(role)}`);
          await admin.$executeRawUnsafe(`DROP ROLE ${identifier(role)}`);
        }
      } finally {
        await admin.$disconnect();
      }
    }
  }
  console.log(`RLS integration: ${passed} passed, ${failed} failed; fixtures and runtime role removed`);
  if (failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`RLS integration aborted during ${stage}: ${describeError(error)}`);
  process.exitCode = 1;
});
