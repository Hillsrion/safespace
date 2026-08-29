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
import { acceptInvitationForExistingUser, InvalidInviteError } from "../app/services/invite-acceptance.server";
import { exportAccountData } from "../app/services/account-export.server";
import type { MediaStorage } from "../app/services/media-storage.server";
import { verifySensitiveReview } from "./verify-sensitive-review";
import { verifyEvidenceOrganization } from "./verify-evidence-organization";
import { verifyInternalHandleReview } from "./verify-internal-handle-review";
import { verifyMemberSpaceActivity } from "./verify-member-space-activity";

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
  existingInvite: randomUUID(), wrongEmailInvite: randomUUID(), overwriteInvite: randomUUID(),
  exportForeignMedia: randomUUID(), exportOwnFlag: randomUUID(),
  activeAnnouncement: randomUUID(), expiredAnnouncement: randomUUID(), futureAnnouncement: randomUUID(), nonUtcAnnouncement: randomUUID(),
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
const exportSubject = scenarios.find(({ name }) => name === "active suspension")!;
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
        media(ids.exportForeignMedia, exportSubject.postId, ids.editor),
        ...scenarios.map(({ id, postId, mediaId }) => media(mediaId, postId, id)),
        ...departures.map(({ id, postId, mediaId, storageKey }) => media(mediaId, postId, id, storageKey)),
      ] });
      await tx.invite.create({ data: {
        email: `invite-${runId}@rls.invalid`, token: runId, spaceId: ids.spaceB,
        invitedByUserId: ids.outsider, roleToAssign: "EDITOR", expiresAt: future,
      } });
      await tx.invite.createMany({ data: [
        { id: ids.existingInvite, email: `${runId}-${ids.outsider}@rls.invalid`, token: `accept-${runId}`, roleToAssign: "EDITOR" },
        { id: ids.wrongEmailInvite, email: `${runId}-${ids.reader}@rls.invalid`, token: `wrong-email-${runId}`, roleToAssign: "EDITOR" },
        { id: ids.overwriteInvite, email: `${runId}-${ids.editor}@rls.invalid`, token: `overwrite-${runId}`, roleToAssign: "ADMIN" },
      ].map((invite) => ({ ...invite, spaceId: ids.spaceA, invitedByUserId: ids.admin, expiresAt: future })) });
      await tx.postFlag.create({ data: { id: ids.flag, postId: ids.publicPost, flaggerUserId: ids.reader, reason: "RLS fixture", status: "resolved" } });
      await tx.postFlag.create({ data: { id: ids.exportOwnFlag, postId: ids.publicPost, flaggerUserId: exportSubject.id, reason: "Own export fixture" } });
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
      await tx.systemAnnouncement.createMany({ data: [
        { id: ids.activeAnnouncement, content: "Active system notice", publishedAt: past, createdByUserId: ids.superadmin },
        { id: ids.expiredAnnouncement, content: "Expired system notice", publishedAt: past, expiresAt: new Date(Date.now() - 3_600_000), createdByUserId: ids.superadmin },
        { id: ids.futureAnnouncement, content: "Future system notice", publishedAt: future, createdByUserId: ids.superadmin },
        // The offset is normalized by Prisma into UTC; it must remain active
        // regardless of the PostgreSQL session TimeZone.
        { id: ids.nonUtcAnnouncement, content: "Offset system notice", publishedAt: new Date("2020-01-01T12:00:00+02:00"), createdByUserId: ids.superadmin },
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
        // Author identity cannot be detached/reassigned through generic edits;
        // self-scoped withdrawal remains available, including under suspension.
        await denied(actor, (tx) => tx.$executeRaw`UPDATE "Post" SET "authorId" = NULL, "isAnonymous" = true WHERE id = ${scenario.postId}::uuid`);
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

    await verifyMemberSpaceActivity({ admin, scoped, ids, check, suspendedId: exportSubject.id, restrictedId: scenarios.find(({ name }) => name === "active restriction")!.id });
    await admin.media.update({ where: { id: exportSubject.mediaId }, data: { evidenceCategory: "document", caption: "Own private evidence caption", sortOrder: 2 } });
    const verifyOwnExport = async () => {
      const result = await as({ id: exportSubject.id }, () => exportAccountData({ id: exportSubject.id }, scoped));
      assert.deepEqual(result.contributions.map(({ id }) => id), [exportSubject.postId]);
      assert.deepEqual(result.contributions[0].media.map(({ id }) => id), [exportSubject.mediaId], "An author's export must exclude another uploader's media metadata");
      assert.deepEqual(result.uploadedMedia.map(({ id }) => id), [exportSubject.mediaId]);
      assert.equal(result.version, 5);
      for (const media of [result.uploadedMedia[0], result.contributions[0].media[0]]) {
        assert.equal(media.evidenceCategory, "document");
        assert.equal(media.caption, "Own private evidence caption");
        assert.equal(media.sortOrder, 2);
      }
      assert.deepEqual(result.moderationFlags.map(({ id }) => id), [ids.exportOwnFlag]);
      const serialized = JSON.stringify(result);
      for (const forbidden of ['"password"', '"storageKey"', '"uploaderId"', ids.foreignPost, ids.exportForeignMedia, ids.outsider, ids.editor]) {
        assert.ok(!serialized.includes(forbidden), `Self export leaked forbidden field or foreign data: ${forbidden}`);
      }
      return result;
    };
    await check("suspended account export retains only own contributions without sensitive media fields", async () => {
      assert.equal(await as({ id: exportSubject.id }, () => scoped.post.count({ where: { id: exportSubject.postId } })), 0);
      const result = await verifyOwnExport();
      assert.equal(result.memberships.find(({ spaceId }) => spaceId === ids.spaceA)?.spaceName, null, "Export must not re-expose a suspended space's name");
    });
    await check("account export survives membership removal without exposing other contributors", async () => {
      await admin.userSpaceMembership.delete({ where: { userId_spaceId: { userId: exportSubject.id, spaceId: ids.spaceA } } });
      try {
        const result = await verifyOwnExport();
        assert.ok(result.memberships.every(({ spaceId }) => spaceId !== ids.spaceA));
      } finally {
        await admin.userSpaceMembership.create({ data: { userId: exportSubject.id, spaceId: ids.spaceA, role: exportSubject.role } });
      }
    });
    await check("self-export SQL primitive rejects a connection without context", async () => {
      await assert.rejects(
        () => rollback(null, (tx) => tx.$queryRaw`SELECT safespace_private.export_own_contributions()`),
        (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" && error.meta?.code === "42501"
      );
    });
    await check("existing-account invitation accepts matching email/token without creating an account", async () => {
      const before = await admin.user.count();
      try {
        const result = await acceptInvitationForExistingUser(
          { id: ids.outsider, email: `${runId}-${ids.outsider}@rls.invalid` }, `accept-${runId}`, scoped
        );
        assert.equal(result.spaceId, ids.spaceA);
        assert.equal(await admin.user.count(), before);
        assert.equal((await admin.userSpaceMembership.findUnique({ where: { userId_spaceId: { userId: ids.outsider, spaceId: ids.spaceA } } }))?.role, "EDITOR");
        assert.equal((await admin.invite.findUnique({ where: { id: ids.existingInvite } }))?.isUsed, true);
        assert.equal(await admin.userSpaceMembership.count({ where: { userId: ids.outsider, spaceId: ids.spaceB } }), 1);
      } finally {
        // Restore isolation fixtures while keeping the token consumed, so the
        // next assertion tests token reuse independently of existing membership.
        await admin.userSpaceMembership.deleteMany({ where: { userId: ids.outsider, spaceId: ids.spaceA } });
      }
    });
    await check("existing-account invitation rejects a used token without membership writes", async () => {
      await assert.rejects(() => acceptInvitationForExistingUser(
        { id: ids.outsider, email: `${runId}-${ids.outsider}@rls.invalid` }, `accept-${runId}`, scoped
      ), InvalidInviteError);
      assert.equal(await admin.userSpaceMembership.count({ where: { userId: ids.outsider, spaceId: ids.spaceA } }), 0);
    });
    await check("existing-account invitation rejects another email and rolls back its claim", async () => {
      await assert.rejects(() => acceptInvitationForExistingUser(
        { id: ids.outsider, email: `${runId}-${ids.outsider}@rls.invalid` }, `wrong-email-${runId}`, scoped
      ), InvalidInviteError);
      assert.equal((await admin.invite.findUnique({ where: { id: ids.wrongEmailInvite } }))?.isUsed, false);
      assert.equal(await admin.userSpaceMembership.count({ where: { userId: ids.outsider, spaceId: ids.spaceA } }), 0);
    });
    await check("existing-account invitation cannot overwrite a membership role; claim rolls back", async () => {
      await assert.rejects(() => acceptInvitationForExistingUser(
        { id: ids.editor, email: `${runId}-${ids.editor}@rls.invalid` }, `overwrite-${runId}`, scoped
      ), InvalidInviteError);
      assert.equal((await admin.userSpaceMembership.findUnique({ where: { userId_spaceId: { userId: ids.editor, spaceId: ids.spaceA } } }))?.role, "EDITOR");
      assert.equal((await admin.invite.findUnique({ where: { id: ids.overwriteInvite } }))?.isUsed, false);
    });
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
    await check("system announcements: authenticated users see active notices only", async () => {
      for (const actor of [{ id: ids.editor }, { id: ids.admin }]) {
        const notices = await as(actor, () => scoped.systemAnnouncement.findMany({ select: { id: true } }));
        assert.ok(notices.some(({ id }) => id === ids.activeAnnouncement), `${actor.id}: active notice absent`);
        assert.ok(notices.some(({ id }) => id === ids.nonUtcAnnouncement), `${actor.id}: offset notice absent`);
        assert.ok(!notices.some(({ id }) => id === ids.expiredAnnouncement || id === ids.futureAnnouncement), `${actor.id}: inactive notice exposed`);
      }
      const superadminNotices = await as({ id: ids.superadmin, isSuperAdmin: true }, () => scoped.systemAnnouncement.findMany({ select: { id: true } }));
      assert.ok(superadminNotices.some(({ id }) => id === ids.futureAnnouncement), "Superadmin management view must include scheduled notices");
      assert.equal(await direct.systemAnnouncement.count(), 0, "No DB context cannot read announcements");
      assert.equal(await as({ id: randomUUID() }, () => scoped.systemAnnouncement.count()), 0, "A forged context without an account cannot read announcements");
    });
    await check("system announcements: RLS fixes the creator and only allows superadmin mutations", async () => {
      await assert.rejects(() => as({ id: ids.editor }, () => scoped.systemAnnouncement.create({ data: { content: "forbidden", publishedAt: new Date(), createdByUserId: ids.editor } })));
      await assert.rejects(() => as({ id: ids.superadmin, isSuperAdmin: true }, () => scoped.systemAnnouncement.create({ data: { content: "forged creator", publishedAt: new Date(), createdByUserId: ids.editor } })));
      await assert.rejects(() => as({ id: ids.superadmin, isSuperAdmin: true }, () => scoped.systemAnnouncement.update({ where: { id: ids.activeAnnouncement }, data: { createdByUserId: ids.editor } })));
      const rollbackCreator = randomUUID();
      await admin.$transaction(async (tx) => {
        await tx.user.create({ data: { id: rollbackCreator, email: `${runId}-${rollbackCreator}@rls.invalid`, password: "unused", firstName: "RLS", lastName: "Creator" } });
        const announcement = await tx.systemAnnouncement.create({ data: { content: "FK set null", publishedAt: past, createdByUserId: rollbackCreator } });
        await tx.user.delete({ where: { id: rollbackCreator } });
        assert.equal((await tx.systemAnnouncement.findUnique({ where: { id: announcement.id } }))?.createdByUserId, null);
        throw new Error("intentional integration rollback");
      }).catch((error) => { if (!(error instanceof Error) || error.message !== "intentional integration rollback") throw error; });
    });
    await verifyEvidenceOrganization({ admin, scoped, ids, check });
    await verifyInternalHandleReview({
      admin,
      scoped,
      runtimeUrl: parsedUrl.toString(),
      ids,
      check,
    });
    await verifySensitiveReview({ admin, runtime: direct, scoped, runtimeUrl: parsedUrl.toString(), ids, check });
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
          await tx.systemAnnouncement.deleteMany({ where: { id: { in: [ids.activeAnnouncement, ids.expiredAnnouncement, ids.futureAnnouncement, ids.nonUtcAnnouncement] } } });
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
