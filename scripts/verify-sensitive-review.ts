import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "../app/generated/prisma";
import { runWithDbContext } from "../app/db/context.server";
import { createContextualPrismaClient } from "../app/db/contextual-client.server";
import { decideSensitiveReview, listSensitiveReviews, requireSensitiveReview } from "../app/services/sensitive-review.server";
import { HttpError } from "../app/lib/api/http-error";
import { deleteAccount } from "../app/services/member-lifecycle.server";
import { hashPassword } from "../app/lib/password";
import { getOwnSensitiveReviewFeedback } from "../app/services/sensitive-review-feedback.server";
import { exportAccountData } from "../app/services/account-export.server";

type Actor = { id: string; isSuperAdmin?: boolean };
type Fixture = { admin: string; moderator: string; editor: string; reader: string; outsider: string; superadmin: string; spaceA: string; spaceB: string };
type Check = (name: string, operation: () => Promise<void>) => Promise<void>;
const as = <T>(actor: Actor, operation: () => T) => runWithDbContext({ mode: "user", userId: actor.id, isSuperAdmin: actor.isSuperAdmin ?? false }, operation);

/** Called by verify-rls after its disposable role and spaces are established. */
export async function verifySensitiveReview({ admin, runtime, scoped, runtimeUrl, ids, check }: {
  admin: PrismaClient; runtime: PrismaClient; scoped: PrismaClient; runtimeUrl: string; ids: Fixture; check: Check;
}) {
  const moderator = { id: ids.moderator };
  const administrator = { id: ids.admin };
  const superadmin = { id: ids.superadmin, isSuperAdmin: true };
  const editor = { id: ids.editor };
  const note = "Evidence and context examined independently.";
  const fresh = async (authorId = ids.editor, high = true) => {
    const entity = await admin.reportedEntity.create({ data: { name: `Review fixture ${randomUUID()}`, spaceId: ids.spaceA } });
    return admin.post.create({ data: {
      spaceId: ids.spaceA, reportedEntityId: entity.id, authorId,
      description: "Sensitive allegation fixture", isAnonymous: true, severity: high ? "high" : "low",
    } });
  };
  const decide = (actor: Actor, post: { id: string; contentRevision: number }, stage: number, outcome: "approve" | "request_changes" = "approve", client = scoped) => as(actor, () =>
    decideSensitiveReview(actor, ids.spaceA, post.id, { revision: post.contentRevision, stage, outcome, note }, client));
  const complete = async (post: { id: string; contentRevision: number }) => {
    await decide(moderator, post, 1); await decide(administrator, post, 2); await decide(superadmin, post, 3);
  };
  const http = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
  const sqlDenied = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" && error.meta?.code === "42501";
  const current = (postId: string) => admin.post.findUniqueOrThrow({ where: { id: postId } });
  const round = (postId: string) => admin.sensitiveReviewRound.findFirstOrThrow({ where: { postId }, orderBy: { revision: "desc" }, include: { decisions: true } });
  const assertInvalidated = async (post: { id: string; contentRevision: number }) => {
    const updated = await current(post.id);
    assert.ok(updated.contentRevision > post.contentRevision);
    assert.equal(updated.verificationStatus, "pending");
    assert.equal((await round(post.id)).status, updated.authorId ? "pending" : "blocked");
    assert.equal((await admin.sensitiveReviewRound.findUniqueOrThrow({ where: { postId_revision: { postId: post.id, revision: post.contentRevision } } })).status, "superseded");
    return updated;
  };

  await check("sensitive review: high severity automatically opens a pending round without changing visibility", async () => {
    const post = await fresh();
    assert.equal(post.requiresSensitiveReview, true); assert.equal(post.verificationStatus, "pending");
    assert.equal(post.status, "active"); assert.equal(post.isAdminOnly, false);
    assert.equal((await round(post.id)).status, "pending");
    const changed = await as(editor, () => scoped.post.update({ where: { id: post.id }, data: { severity: "low", requiresSensitiveReview: false } }));
    assert.equal(changed.requiresSensitiveReview, true, "Lowering severity or clearing the flag must not bypass review");
  });
  await check("sensitive review: motivated manual classification is persistent and scoped", async () => {
    const post = await fresh(ids.editor, false);
    await assert.rejects(() => as({ id: ids.outsider }, () => requireSensitiveReview({ id: ids.outsider }, ids.spaceA, post.id, { revision: post.contentRevision, reason: note }, scoped)), http(403));
    await assert.rejects(() => as(moderator, () => scoped.$queryRaw`SELECT safespace_private.require_sensitive_review(${post.id}::uuid, ${post.contentRevision}::int, 'short')`), (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.meta?.code === "22023");
    await as(moderator, () => requireSensitiveReview(moderator, ids.spaceA, post.id, { revision: post.contentRevision, reason: note }, scoped));
    assert.equal((await current(post.id)).requiresSensitiveReview, true);
    assert.equal((await round(post.id)).reason, note);
  });
  await check("sensitive review: populated workflow tables and functions deny absent context", async () => {
    const post = await fresh();
    assert.equal(await runtime.sensitiveReviewRound.count(), 0);
    assert.equal(await runtime.sensitiveReviewDecision.count(), 0);
    await assert.rejects(() => runtime.$queryRaw`SELECT safespace_private.decide_sensitive_review(${post.id}::uuid, 1, 1, 'approve', ${note})`, sqlDenied);
    await assert.rejects(() => runtime.$queryRaw`SELECT safespace_private.detach_own_audit_identity()`, sqlDenied);
  });
  await check("sensitive review: raw runtime SQL cannot forge or erase decisions, revisions, authors or verification", async () => {
    const post = await fresh();
    const initialRound = await round(post.id);
    await assert.rejects(() => as(moderator, () => scoped.$executeRaw`UPDATE "Post" SET "verificationStatus" = 'verified' WHERE id = ${post.id}::uuid`), sqlDenied);
    await assert.rejects(() => as(moderator, () => scoped.$executeRaw`UPDATE "Post" SET "contentRevision" = 100 WHERE id = ${post.id}::uuid`), sqlDenied);
    await assert.rejects(() => as(moderator, () => scoped.$executeRaw`UPDATE "Post" SET "authorId" = ${ids.reader}::uuid WHERE id = ${post.id}::uuid`), sqlDenied);
    await assert.rejects(() => as(superadmin, () => scoped.$executeRaw`INSERT INTO "SensitiveReviewDecision" (id, "roundId", stage, "reviewerUserId", outcome, note) VALUES (${randomUUID()}::uuid, ${initialRound.id}::uuid, 1, ${ids.moderator}::uuid, 'approve', ${note})`), sqlDenied);
    assert.equal(await as(superadmin, () => scoped.$executeRaw`UPDATE "SensitiveReviewRound" SET status = 'approved' WHERE id = ${initialRound.id}::uuid`), 0);
    await decide(moderator, post, 1);
    assert.equal(await as(superadmin, () => scoped.$executeRaw`UPDATE "SensitiveReviewDecision" SET note = 'Silently replaced' WHERE "roundId" = ${initialRound.id}::uuid`), 0);
    assert.equal(await as(superadmin, () => scoped.$executeRaw`DELETE FROM "SensitiveReviewDecision" WHERE "roundId" = ${initialRound.id}::uuid`), 0);
  });
  await check("sensitive review: moderator, admin, superadmin must act in order, never substitute a higher role", async () => {
    const post = await fresh();
    await assert.rejects(() => decide(administrator, post, 2), http(409));
    await assert.rejects(() => decide(administrator, post, 1), http(403));
    await assert.rejects(() => decide(superadmin, post, 1), http(403));
    await complete(post);
    assert.equal((await current(post.id)).verificationStatus, "verified");
    assert.equal((await round(post.id)).status, "approved");
    await assert.rejects(() => decide(superadmin, post, 3), http(409));
  });
  await check("sensitive review: anonymous author is excluded and queue DTO contains no identities or object keys", async () => {
    const post = await fresh(ids.moderator);
    await assert.rejects(() => decide(moderator, post, 1), http(403));
    await admin.media.create({ data: { postId: post.id, uploaderId: ids.moderator, storageKey: `review-secret/${randomUUID()}`, fileName: "safe.jpg", mimeType: "image/jpeg", fileSize: 1 } });
    const queue = await as(moderator, () => listSensitiveReviews(moderator, ids.spaceA, { classification: "required", limit: 50 }, scoped));
    const item = queue.items.find(({ id }) => id === post.id)!;
    assert.ok(item); assert.equal(item.canDecide, false);
    const serialized = JSON.stringify(item);
    for (const forbidden of [ids.moderator, "authorId", "reviewerUserId", "uploaderId", "storageKey", "review-secret/"]) assert.ok(!serialized.includes(forbidden), `Queue leaked ${forbidden}`);
    assert.equal(await as({ id: ids.outsider }, () => scoped.sensitiveReviewRound.count()), 0);
    await assert.rejects(() => as({ id: ids.outsider }, () => listSensitiveReviews({ id: ids.outsider }, ids.spaceA, { classification: "required", limit: 20 }, scoped)), http(403));
  });
  await check("sensitive review: the same person cannot decide twice after promotion", async () => {
    const post = await fresh(); await decide(moderator, post, 1);
    await admin.userSpaceMembership.update({ where: { userId_spaceId: { userId: ids.moderator, spaceId: ids.spaceA } }, data: { role: "ADMIN" } });
    try { await assert.rejects(() => decide(moderator, post, 2), http(403)); }
    finally { await admin.userSpaceMembership.update({ where: { userId_spaceId: { userId: ids.moderator, spaceId: ids.spaceA } }, data: { role: "MODERATOR" } }); }
  });
  for (const kind of ["restriction", "suspension"] as const) {
    for (const expired of [false, true]) {
      await check(`sensitive review: ${expired ? "expired" : "active"} ${kind} ${expired ? "permits" : "denies"} decisions`, async () => {
        const post = await fresh();
        const discipline = await admin.disciplinaryAction.create({ data: { spaceId: ids.spaceA, userId: ids.moderator, issuedByUserId: ids.admin, kind, level: 1, reason: "Review access fixture", expiresAt: new Date(Date.now() + (expired ? -60_000 : 60_000)) } });
        try {
          if (expired) await decide(moderator, post, 1);
          else {
            await as(moderator, () => scoped.$transaction(async (tx) => {
              await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'Pacific/Auckland'");
              const [result] = await tx.$queryRaw<{ kind: string | null }[]>`SELECT safespace_private.active_discipline_kind(${ids.spaceA}::uuid, ${ids.moderator}::uuid) AS kind`;
              assert.equal(result.kind, kind, "UTC expiry must be independent of the database session timezone");
            }));
            await assert.rejects(() => decide(moderator, post, 1), http(403), "Service must reject active discipline");
            await assert.rejects(() => as(moderator, () => scoped.$queryRaw`SELECT safespace_private.decide_sensitive_review(${post.id}::uuid, ${post.contentRevision}::int, 1, 'approve', ${note})`), sqlDenied, "SQL primitive must reject active discipline");
            assert.equal(await as(moderator, () => scoped.sensitiveReviewRound.count()), 0);
          }
        } finally { await admin.disciplinaryAction.delete({ where: { id: discipline.id } }); }
      });
    }
  }
  await check("sensitive review: correction request closes this round until content changes", async () => {
    const post = await fresh(); await decide(moderator, post, 1, "request_changes");
    assert.equal((await round(post.id)).status, "changes_requested");
    await assert.rejects(() => decide(administrator, post, 2), http(409));
    await as(editor, () => scoped.post.update({ where: { id: post.id }, data: { description: "Corrected report content" } }));
    const revised = await assertInvalidated(post); await decide(moderator, revised, 1);
  });
  for (const mutation of ["description", "severity", "privacy", "media_insert", "media_update", "media_delete", "entity_name", "entity_target", "entity_handle", "handle_update", "handle_delete"] as const) {
    await check(`sensitive review: ${mutation} invalidates all three approvals and rejects stale decisions`, async () => {
      let post = await fresh();
      const media = await admin.media.create({ data: { postId: post.id, uploaderId: ids.editor, storageKey: `review-fixture/${randomUUID()}`, fileName: "safe.jpg", mimeType: "image/jpeg", fileSize: 1 } });
      const handle = await admin.reportedEntityHandle.create({ data: { reportedEntityId: post.reportedEntityId, handle: `old_${randomUUID()}` } });
      post = await current(post.id); await complete(post);
      await as(moderator, async () => {
        if (mutation === "description") await scoped.post.update({ where: { id: post.id }, data: { description: "Changed evidence description" } });
        if (mutation === "severity") await scoped.post.update({ where: { id: post.id }, data: { severity: "low" } });
        if (mutation === "privacy") await scoped.post.update({ where: { id: post.id }, data: { isAdminOnly: true } });
        if (mutation === "media_insert") await scoped.media.create({ data: { postId: post.id, uploaderId: ids.moderator, storageKey: `review-fixture/${randomUUID()}`, fileName: "new.jpg", mimeType: "image/jpeg", fileSize: 1 } });
        if (mutation === "media_update") await scoped.media.update({ where: { id: media.id }, data: { sha256: "changed-hash" } });
        if (mutation === "media_delete") await scoped.media.delete({ where: { id: media.id } });
        if (mutation === "entity_name") await as(administrator, () => scoped.reportedEntity.update({ where: { id: post.reportedEntityId }, data: { name: `Changed target ${randomUUID()}` } }));
        if (mutation === "entity_target") {
          const target = await scoped.reportedEntity.create({ data: { name: `New target ${randomUUID()}`, spaceId: ids.spaceA, addedByUserId: ids.moderator } });
          await scoped.post.update({ where: { id: post.id }, data: { reportedEntityId: target.id } });
        }
        if (mutation === "entity_handle") await scoped.reportedEntityHandle.create({ data: { reportedEntityId: post.reportedEntityId, handle: `new_${randomUUID()}` } });
        if (mutation === "handle_update") await as(administrator, () => scoped.reportedEntityHandle.update({ where: { id: handle.id }, data: { handle: `changed_${randomUUID()}` } }));
        if (mutation === "handle_delete") await as(administrator, () => scoped.reportedEntityHandle.delete({ where: { id: handle.id } }));
      });
      await assertInvalidated(post);
      await assert.rejects(() => decide(moderator, post, 1), http(409));
    });
  }
  await check("sensitive review: approval does not publish hidden or admin-only content", async () => {
    const initial = await fresh();
    const post = await admin.post.update({ where: { id: initial.id }, data: { status: "hidden", isAdminOnly: true } });
    await complete(post);
    const approved = await current(post.id);
    assert.equal(approved.status, "hidden"); assert.equal(approved.isAdminOnly, true);
    assert.equal(await as({ id: ids.reader }, () => scoped.post.count({ where: { id: post.id } })), 0);
  });
  await check("sensitive review: deleting a reviewer's account detaches identity and invalidates approval", async () => {
    const password = "Disposable-review-fixture-password-1!";
    const reviewer = await admin.user.create({ data: { email: `review-${randomUUID()}@rls.invalid`, password: await hashPassword(password), firstName: "Review", lastName: "Fixture" } });
    const auditIds: string[] = [];
    // Track the newly created account audit by its returned ID before privacy
    // detaches its target/actor. Never clean up another run's anonymous events.
    const trackedRuntime = runtime.$extends({ query: { auditLog: {
      async create({ args, query }) {
        const record = await query(args);
        assert.ok(record.id, "The lifecycle fixture must return its audit ID for scoped cleanup");
        auditIds.push(record.id); return record;
      },
    } } });
    const tracked = createContextualPrismaClient(trackedRuntime as unknown as PrismaClient);
    try {
      await admin.userSpaceMembership.create({ data: { userId: reviewer.id, spaceId: ids.spaceA, role: "MODERATOR" } });
      const post = await fresh();
      await decide({ id: reviewer.id }, post, 1); await decide(administrator, post, 2); await decide(superadmin, post, 3);
      await as({ id: reviewer.id }, () => deleteAccount({ id: reviewer.id }, { password, contributionPolicy: "anonymize" }, tracked));
      assert.equal(await admin.user.count({ where: { id: reviewer.id } }), 0);
      await assertInvalidated(post);
      const historical = await admin.sensitiveReviewDecision.findMany({ where: { round: { postId: post.id } } });
      assert.equal(historical.find(({ stage }) => stage === 1)?.reviewerUserId, null);
      assert.ok(!JSON.stringify(historical).includes(reviewer.id));
    } finally {
      await admin.auditLog.deleteMany({ where: { id: { in: auditIds } } });
      await admin.auditLog.updateMany({ where: { actorUserId: reviewer.id }, data: { actorUserId: null } });
      await admin.user.deleteMany({ where: { id: reviewer.id } });
    }
  });
  await check("sensitive review: author detachment permanently fails closed without retaining their identity", async () => {
    const post = await fresh(ids.reader); await complete(post);
    await as({ id: ids.reader }, () => scoped.$queryRaw`SELECT safespace_private.withdraw_own_contributions(${ids.spaceA}::uuid, 'anonymize')`);
    await assertInvalidated(post);
    assert.equal((await current(post.id)).authorId, null);
    const records = await admin.sensitiveReviewRound.findMany({ where: { postId: post.id }, include: { decisions: true } });
    assert.ok(!JSON.stringify(records).includes(ids.reader));
    const revised = await current(post.id);
    await assert.rejects(() => decide(moderator, revised, 1), http(403));
    await assert.rejects(() => as(superadmin, () => scoped.$executeRaw`UPDATE "Post" SET "authorId" = ${ids.editor}::uuid WHERE id = ${post.id}::uuid`), sqlDenied);
  });

  await check("sensitive feedback: only the visible author receives correction requests, never reviewer identities or approval notes", async () => {
    const post = await fresh();
    await decide(moderator, post, 1);
    await decide(administrator, post, 2, "request_changes");
    const feedback = await as(editor, () => getOwnSensitiveReviewFeedback(post.id, scoped));
    assert.equal(feedback?.status, "changes_requested");
    assert.deepEqual(feedback?.corrections.map(({ stage }) => stage), [2]);
    for (const value of [ids.admin, ids.moderator, "reviewerUserId"]) assert.ok(!JSON.stringify(feedback).includes(value));
    assert.equal(await as(moderator, () => getOwnSensitiveReviewFeedback(post.id, scoped)), null);
    assert.equal(await as({ id: ids.outsider }, () => getOwnSensitiveReviewFeedback(post.id, scoped)), null);
    assert.equal(await getOwnSensitiveReviewFeedback(post.id, runtime), null);
    await admin.post.update({ where: { id: post.id }, data: { description: "Author clarified the facts" } });
    assert.deepEqual((await as(editor, () => getOwnSensitiveReviewFeedback(post.id, scoped)))?.corrections, []);
  });
  await check("sensitive export: own decisions survive access loss without exposing any other reviewer's note or report", async () => {
    const post = await fresh(); await decide(moderator, post, 1); await decide(administrator, post, 2, "request_changes");
    const restriction = await admin.disciplinaryAction.create({ data: { spaceId: ids.spaceA, userId: ids.moderator, issuedByUserId: ids.admin, kind: "suspension", level: 1, reason: "Disposable export test", status: "active" } });
    try {
      const exported = await as(moderator, () => exportAccountData(moderator, scoped));
      const decisions = exported.sensitiveReviewDecisions.filter((item) => item.postId === post.id);
      assert.equal(decisions.length, 1); assert.equal(decisions[0].stage, 1);
      assert.ok(!JSON.stringify(decisions).includes("Sensitive allegation fixture"));
      assert.ok(!JSON.stringify(decisions).includes(ids.admin));
      assert.equal(await as(moderator, () => scoped.sensitiveReviewDecision.count()), 0);
    } finally { await admin.disciplinaryAction.delete({ where: { id: restriction.id } }); }
    await assert.rejects(() => runtime.$queryRaw`SELECT safespace_private.export_own_sensitive_review_decisions()`, sqlDenied);
  });

  const concurrentUrl = new URL(runtimeUrl); concurrentUrl.searchParams.set("connection_limit", "4");
  const concurrentBase = new PrismaClient({ datasourceUrl: concurrentUrl.toString(), log: [] });
  const concurrent = createContextualPrismaClient(concurrentBase);
  try {
    await check("sensitive review concurrency: duplicate decisions commit exactly once", async () => {
      const post = await fresh();
      const results = await Promise.allSettled([decide(moderator, post, 1, "approve", concurrent), decide(moderator, post, 1, "approve", concurrent)]);
      assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
      assert.equal((await round(post.id)).decisions.length, 1);
      const rejected = results.find(({ status }) => status === "rejected") as PromiseRejectedResult;
      assert.ok(http(409)(rejected.reason));
    });
    await check("sensitive review concurrency: content edit racing final approval never validates the new revision", async () => {
      const post = await fresh(); await decide(moderator, post, 1); await decide(administrator, post, 2);
      const results = await Promise.allSettled([
        decide(superadmin, post, 3, "approve", concurrent),
        as(editor, () => concurrent.post.update({ where: { id: post.id }, data: { description: "Concurrent changed content" } })),
      ]);
      assert.equal(results[1].status, "fulfilled", "The author edit should commit");
      if (results[0].status === "rejected") assert.ok(http(409)(results[0].reason));
      await assertInvalidated(post);
    });
    await check("sensitive review concurrency: evidence insertion racing final approval invalidates the result", async () => {
      const post = await fresh(); await decide(moderator, post, 1); await decide(administrator, post, 2);
      const results = await Promise.allSettled([
        decide(superadmin, post, 3, "approve", concurrent),
        as(editor, () => concurrent.media.create({ data: { postId: post.id, uploaderId: ids.editor, storageKey: `review-fixture/${randomUUID()}`, fileName: "new.jpg", mimeType: "image/jpeg", fileSize: 1 } })),
      ]);
      assert.equal(results[1].status, "fulfilled");
      if (results[0].status === "rejected") assert.ok(http(409)(results[0].reason));
      await assertInvalidated(post);
    });
  } finally { await concurrentBase.$disconnect(); }
}
