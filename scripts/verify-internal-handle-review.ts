/** Disposable-PostgreSQL checks for isolated internal handle reviews. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "../app/generated/prisma";
import { runWithDbContext } from "../app/db/context.server";
import { createContextualPrismaClient } from "../app/db/contextual-client.server";
import { reviewReportedEntityHandle } from "../app/services/reported-entity-admin.server";

type Check = (name: string, operation: () => Promise<void>) => Promise<void>;
type Fixture = {
  admin: string;
  moderator: string;
  editor: string;
  reader: string;
  outsider: string;
  superadmin: string;
  spaceA: string;
  spaceB: string;
  entityA: string;
  entityB: string;
};

type ReviewAuditDetails = {
  changedFields?: unknown;
  reviewStatus?: unknown;
};

export async function verifyInternalHandleReview({
  admin,
  scoped,
  runtimeUrl,
  ids,
  check,
}: {
  admin: PrismaClient;
  scoped: PrismaClient;
  runtimeUrl: string;
  ids: Fixture;
  check: Check;
}): Promise<void> {
  const inContext = <T>(
    client: PrismaClient,
    userId: string,
    operation: () => T
  ): T =>
    runWithDbContext(
      {
        mode: "user",
        userId,
        isSuperAdmin: userId === ids.superadmin,
      },
      operation
    );
  const as = <T>(userId: string, operation: () => T): T =>
    inContext(scoped, userId, operation);

  const handleA = await admin.reportedEntityHandle.findFirstOrThrow({
    where: { reportedEntityId: ids.entityA },
  });
  const handleB = await admin.reportedEntityHandle.findFirstOrThrow({
    where: { reportedEntityId: ids.entityB },
  });
  const databaseTime = async (): Promise<Date> => {
    const [result] = await admin.$queryRaw<Array<{ now: Date }>>`
      SELECT date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC') AS now
    `;
    return result.now;
  };
  const reviewAudits = async (handleId: string) => {
    const rows = await admin.auditLog.findMany({
      where: {
        action: "entity_update",
        targetEntityType: "ReportedEntityHandle",
        targetEntityId: handleId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.filter((row) => {
      const details = row.details as ReviewAuditDetails | null;
      return (
        Array.isArray(details?.changedFields) &&
        details.changedFields.includes("internalHandleReview")
      );
    });
  };
  const reset = (userId: string, handleId: string) =>
    as(userId, () =>
      scoped.reportedEntityHandleReview.deleteMany({
        where: { reportedEntityHandleId: handleId },
      })
    );

  await check(
    "internal handle review: service stores private provenance and exactly one database audit",
    async () => {
      const note = "  Matches the internal report context.  ";
      const auditCountBefore = (await reviewAudits(handleA.id)).length;
      const before = await databaseTime();
      const result = await as(ids.admin, () =>
        reviewReportedEntityHandle(
          { id: ids.admin },
          ids.spaceA,
          ids.entityA,
          handleA.id,
          { status: "consistent", note },
          scoped
        )
      );
      const after = await databaseTime();
      const stored = await admin.reportedEntityHandleReview.findUniqueOrThrow({
        where: { reportedEntityHandleId: handleA.id },
      });

      assert.equal(result.id, handleA.id);
      assert.equal(result.reviewStatus, "consistent");
      assert.equal(stored.reviewNote, note.trim());
      assert.equal(stored.reviewedByUserId, ids.admin);
      assert.ok(stored.reviewedAt.getTime() >= before.getTime());
      assert.ok(stored.reviewedAt.getTime() <= after.getTime());

      const audits = await reviewAudits(handleA.id);
      assert.equal(audits.length, auditCountBefore + 1);
      const audit = audits.at(-1)!;
      assert.equal(audit.actorUserId, ids.admin);
      assert.equal(audit.spaceId, ids.spaceA);
      assert.deepEqual(audit.details, {
        changedFields: ["internalHandleReview"],
        reviewStatus: "consistent",
      });
      assert.ok(!JSON.stringify(audit).includes(note.trim()));

      for (const userId of [ids.editor, ids.reader, ids.moderator]) {
        await as(userId, async () => {
          assert.equal(
            await scoped.reportedEntityHandle.count({ where: { id: handleA.id } }),
            1
          );
          assert.equal(
            await scoped.reportedEntityHandleReview.count({
              where: { reportedEntityHandleId: handleA.id },
            }),
            0
          );
          const visibleAudits = await scoped.auditLog.findMany({
            where: { targetEntityId: handleA.id },
          });
          assert.ok(
            visibleAudits.every((row) => {
              const details = row.details as ReviewAuditDetails | null;
              return !(
                Array.isArray(details?.changedFields) &&
                details.changedFields.includes("internalHandleReview")
              );
            })
          );
        });
      }
      assert.equal(
        await as(ids.admin, () =>
          scoped.reportedEntityHandleReview.count({
            where: { reportedEntityHandleId: handleA.id },
          })
        ),
        1
      );
      assert.equal(
        await as(ids.superadmin, () =>
          scoped.reportedEntityHandleReview.count({
            where: { reportedEntityHandleId: handleA.id },
          })
        ),
        1
      );

      const beforeResetAudits = (await reviewAudits(handleA.id)).length;
      assert.equal((await reset(ids.admin, handleA.id)).count, 1);
      assert.equal(
        await admin.reportedEntityHandleReview.count({
          where: { reportedEntityHandleId: handleA.id },
        }),
        0
      );
      const resetAudits = await reviewAudits(handleA.id);
      assert.equal(resetAudits.length, beforeResetAudits + 1);
      assert.deepEqual(resetAudits.at(-1)?.details, {
        changedFields: ["internalHandleReview"],
        reviewStatus: "unreviewed",
      });
    }
  );

  await check(
    "internal handle review: direct INSERT and UPDATE derive provenance and audit once",
    async () => {
      const forgedTime = new Date("2100-01-01T00:00:00.000Z");
      const insertAuditCount = (await reviewAudits(handleA.id)).length;
      const beforeInsert = await databaseTime();
      await as(ids.admin, () =>
        scoped.reportedEntityHandleReview.create({
          data: {
            reportedEntityHandleId: handleA.id,
            reviewStatus: "questionable",
            reviewNote: "  Needs another internal check.  ",
            reviewedAt: forgedTime,
            reviewedByUserId: ids.editor,
          },
        })
      );
      const afterInsert = await databaseTime();
      let stored = await admin.reportedEntityHandleReview.findUniqueOrThrow({
        where: { reportedEntityHandleId: handleA.id },
      });
      assert.equal(stored.reviewStatus, "questionable");
      assert.equal(stored.reviewNote, "Needs another internal check.");
      assert.equal(stored.reviewedByUserId, ids.admin);
      assert.notEqual(stored.reviewedAt.toISOString(), forgedTime.toISOString());
      assert.ok(stored.reviewedAt.getTime() >= beforeInsert.getTime());
      assert.ok(stored.reviewedAt.getTime() <= afterInsert.getTime());
      assert.equal((await reviewAudits(handleA.id)).length, insertAuditCount + 1);

      const updateAuditCount = (await reviewAudits(handleA.id)).length;
      const beforeUpdate = await databaseTime();
      await as(ids.admin, () =>
        scoped.reportedEntityHandleReview.update({
          where: { reportedEntityHandleId: handleA.id },
          data: {
            reviewStatus: "obsolete",
            reviewNote: "  Account no longer matches current reports.  ",
            reviewedAt: forgedTime,
            reviewedByUserId: ids.reader,
          },
        })
      );
      const afterUpdate = await databaseTime();
      stored = await admin.reportedEntityHandleReview.findUniqueOrThrow({
        where: { reportedEntityHandleId: handleA.id },
      });
      assert.equal(stored.reviewStatus, "obsolete");
      assert.equal(stored.reviewNote, "Account no longer matches current reports.");
      assert.equal(stored.reviewedByUserId, ids.admin);
      assert.ok(stored.reviewedAt.getTime() >= beforeUpdate.getTime());
      assert.ok(stored.reviewedAt.getTime() <= afterUpdate.getTime());
      const updateAudits = await reviewAudits(handleA.id);
      assert.equal(updateAudits.length, updateAuditCount + 1);
      assert.deepEqual(updateAudits.at(-1)?.details, {
        changedFields: ["internalHandleReview"],
        reviewStatus: "obsolete",
      });
      assert.ok(
        !JSON.stringify(updateAudits).includes(
          "Account no longer matches current reports."
        )
      );

      const beforeNoop = await admin.reportedEntityHandleReview.findUniqueOrThrow({
        where: { reportedEntityHandleId: handleA.id },
      });
      const noopAuditCount = (await reviewAudits(handleA.id)).length;
      await as(ids.admin, () =>
        scoped.reportedEntityHandleReview.update({
          where: { reportedEntityHandleId: handleA.id },
          data: {
            reviewStatus: beforeNoop.reviewStatus,
            reviewNote: beforeNoop.reviewNote,
          },
        })
      );
      const afterNoop = await admin.reportedEntityHandleReview.findUniqueOrThrow({
        where: { reportedEntityHandleId: handleA.id },
      });
      assert.equal(
        afterNoop.reviewedAt.toISOString(),
        beforeNoop.reviewedAt.toISOString()
      );
      assert.equal(afterNoop.reviewedByUserId, beforeNoop.reviewedByUserId);
      assert.equal((await reviewAudits(handleA.id)).length, noopAuditCount);

      await reset(ids.admin, handleA.id);
    }
  );

  await check(
    "internal handle review: validation and RLS reject forged, non-admin and cross-tenant writes",
    async () => {
      for (const userId of [ids.editor, ids.reader, ids.outsider]) {
        await assert.rejects(() =>
          as(userId, () =>
            scoped.reportedEntityHandleReview.create({
              data: {
                reportedEntityHandleId: handleA.id,
                reviewStatus: "obsolete",
                reviewNote: "Unauthorized internal review",
              },
            })
          )
        );
      }
      await assert.rejects(() =>
        as(ids.admin, () =>
          scoped.reportedEntityHandleReview.create({
            data: {
              reportedEntityHandleId: handleB.id,
              reviewStatus: "obsolete",
              reviewNote: "Cross-tenant internal review",
            },
          })
        )
      );

      for (const data of [
        { reviewStatus: "unreviewed", reviewNote: "Invalid stored reset" },
        { reviewStatus: "consistent", reviewNote: "  " },
        { reviewStatus: "externally_verified", reviewNote: "Invalid external claim" },
      ]) {
        await assert.rejects(() =>
          as(ids.admin, () =>
            scoped.reportedEntityHandleReview.create({
              data: { reportedEntityHandleId: handleA.id, ...data },
            })
          )
        );
      }
      assert.equal(
        await admin.reportedEntityHandleReview.count({
          where: { reportedEntityHandleId: handleA.id },
        }),
        0
      );

      await as(ids.superadmin, () =>
        scoped.reportedEntityHandleReview.create({
          data: {
            reportedEntityHandleId: handleB.id,
            reviewStatus: "obsolete",
            reviewNote: "Global internal review",
          },
        })
      );
      const foreign = await admin.reportedEntityHandleReview.findUniqueOrThrow({
        where: { reportedEntityHandleId: handleB.id },
      });
      assert.equal(foreign.reviewedByUserId, ids.superadmin);
      await reset(ids.superadmin, handleB.id);
    }
  );

  await check(
    "internal handle review: account deletion detaches only reviewer identity",
    async () => {
      const reviewerId = randomUUID();
      const entityId = randomUUID();
      const handleId = randomUUID();
      try {
        await admin.user.create({
          data: {
            id: reviewerId,
            email: `${reviewerId}@handle-review.invalid`,
            password: "unused-test-password",
            firstName: "Handle",
            lastName: "Reviewer",
          },
        });
        await admin.userSpaceMembership.create({
          data: { userId: reviewerId, spaceId: ids.spaceA, role: "ADMIN" },
        });
        await admin.reportedEntity.create({
          data: {
            id: entityId,
            name: `Handle review ${entityId}`,
            spaceId: ids.spaceA,
          },
        });
        await admin.reportedEntityHandle.create({
          data: {
            id: handleId,
            reportedEntityId: entityId,
            handle: `reviewer-delete-${handleId}`,
          },
        });
        await inContext(scoped, reviewerId, () =>
          reviewReportedEntityHandle(
            { id: reviewerId },
            ids.spaceA,
            entityId,
            handleId,
            {
              status: "consistent",
              note: "Reviewed before account deletion",
            },
            scoped
          )
        );
        const before = await admin.reportedEntityHandleReview.findUniqueOrThrow({
          where: { reportedEntityHandleId: handleId },
        });
        const auditCount = (await reviewAudits(handleId)).length;
        assert.equal(before.reviewedByUserId, reviewerId);

        await admin.user.delete({ where: { id: reviewerId } });
        const after = await admin.reportedEntityHandleReview.findUniqueOrThrow({
          where: { reportedEntityHandleId: handleId },
        });
        assert.equal(after.reviewStatus, before.reviewStatus);
        assert.equal(after.reviewNote, before.reviewNote);
        assert.equal(after.reviewedAt.toISOString(), before.reviewedAt.toISOString());
        assert.equal(after.reviewedByUserId, null);
        assert.equal((await reviewAudits(handleId)).length, auditCount);
      } finally {
        await admin.reportedEntity.deleteMany({ where: { id: entityId } });
        await admin.user.deleteMany({ where: { id: reviewerId } });
      }
    }
  );

  await check(
    "internal handle review: handle cascade removes review without a false reset audit",
    async () => {
      const entityId = randomUUID();
      const handleId = randomUUID();
      try {
        await admin.reportedEntity.create({
          data: {
            id: entityId,
            name: `Handle cascade ${entityId}`,
            spaceId: ids.spaceA,
          },
        });
        await admin.reportedEntityHandle.create({
          data: {
            id: handleId,
            reportedEntityId: entityId,
            handle: `handle-cascade-${handleId}`,
          },
        });
        await as(ids.admin, () =>
          reviewReportedEntityHandle(
            { id: ids.admin },
            ids.spaceA,
            entityId,
            handleId,
            { status: "questionable", note: "Temporary internal review" },
            scoped
          )
        );
        const auditCount = (await reviewAudits(handleId)).length;
        assert.equal(auditCount, 1);

        await admin.reportedEntityHandle.delete({ where: { id: handleId } });
        assert.equal(
          await admin.reportedEntityHandleReview.count({
            where: { reportedEntityHandleId: handleId },
          }),
          0
        );
        assert.equal((await reviewAudits(handleId)).length, auditCount);
      } finally {
        await admin.reportedEntity.deleteMany({ where: { id: entityId } });
      }
    }
  );

  await check(
    "internal handle review: concurrent service upserts keep one row and one audit per committed change",
    async () => {
      await reset(ids.admin, handleA.id);
      const auditCount = (await reviewAudits(handleA.id)).length;
      const runtimeOne = new PrismaClient({ datasourceUrl: runtimeUrl, log: [] });
      const runtimeTwo = new PrismaClient({ datasourceUrl: runtimeUrl, log: [] });
      const scopedOne = createContextualPrismaClient(runtimeOne);
      const scopedTwo = createContextualPrismaClient(runtimeTwo);
      try {
        await Promise.all([
          inContext(scopedOne, ids.admin, () =>
            reviewReportedEntityHandle(
              { id: ids.admin },
              ids.spaceA,
              ids.entityA,
              handleA.id,
              { status: "consistent", note: "Concurrent review number one" },
              scopedOne
            )
          ),
          inContext(scopedTwo, ids.admin, () =>
            reviewReportedEntityHandle(
              { id: ids.admin },
              ids.spaceA,
              ids.entityA,
              handleA.id,
              { status: "questionable", note: "Concurrent review number two" },
              scopedTwo
            )
          ),
        ]);
      } finally {
        await runtimeOne.$disconnect();
        await runtimeTwo.$disconnect();
      }

      assert.equal(
        await admin.reportedEntityHandleReview.count({
          where: { reportedEntityHandleId: handleA.id },
        }),
        1
      );
      assert.equal((await reviewAudits(handleA.id)).length, auditCount + 2);
      await reset(ids.admin, handleA.id);
    }
  );
}
