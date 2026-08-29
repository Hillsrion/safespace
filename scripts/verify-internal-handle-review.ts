/** Disposable-PostgreSQL checks for internal handle-review provenance. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../app/generated/prisma";
import { runWithDbContext } from "../app/db/context.server";
import { reviewReportedEntityHandle } from "../app/services/reported-entity-admin.server";

type Check = (name: string, operation: () => Promise<void>) => Promise<void>;
type Fixture = {
  admin: string;
  editor: string;
  reader: string;
  outsider: string;
  superadmin: string;
  spaceA: string;
  spaceB: string;
  entityA: string;
  entityB: string;
};

export async function verifyInternalHandleReview({
  admin,
  scoped,
  ids,
  check,
}: {
  admin: PrismaClient;
  scoped: PrismaClient;
  ids: Fixture;
  check: Check;
}): Promise<void> {
  const as = <T>(userId: string, operation: () => T): T =>
    runWithDbContext(
      {
        mode: "user",
        userId,
        isSuperAdmin: userId === ids.superadmin,
      },
      operation
    );
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
  const reset = (userId: string, handleId: string) =>
    as(userId, () =>
      scoped.reportedEntityHandle.update({
        where: { id: handleId },
        data: { reviewStatus: "unreviewed" },
      })
    );

  await check(
    "internal handle review: service commits scoped provenance and a content-free audit",
    async () => {
      const note = "  Matches the internal report context.  ";
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
      const stored = await admin.reportedEntityHandle.findUniqueOrThrow({
        where: { id: handleA.id },
      });
      assert.equal(result.reviewStatus, "consistent");
      assert.equal(stored.reviewNote, note.trim());
      assert.equal(stored.reviewedByUserId, ids.admin);
      assert.ok(stored.reviewedAt);
      assert.ok(stored.reviewedAt.getTime() >= before.getTime());
      assert.ok(stored.reviewedAt.getTime() <= after.getTime());

      const audit = await admin.auditLog.findFirstOrThrow({
        where: {
          action: "entity_update",
          targetEntityType: "ReportedEntityHandle",
          targetEntityId: handleA.id,
          spaceId: ids.spaceA,
        },
        orderBy: { createdAt: "desc" },
      });
      assert.equal(audit.actorUserId, ids.admin);
      assert.deepEqual(audit.details, {
        changedFields: ["internalHandleReview"],
        reviewStatus: "consistent",
      });
      assert.ok(!JSON.stringify(audit.details).includes(note.trim()));

      await reset(ids.admin, handleA.id);
      const cleared = await admin.reportedEntityHandle.findUniqueOrThrow({
        where: { id: handleA.id },
      });
      assert.equal(cleared.reviewStatus, "unreviewed");
      assert.equal(cleared.reviewNote, null);
      assert.equal(cleared.reviewedAt, null);
      assert.equal(cleared.reviewedByUserId, null);
    }
  );

  await check(
    "internal handle review: database replaces forged reviewer and timestamp",
    async () => {
      const forgedTime = new Date("2100-01-01T00:00:00.000Z");
      const before = await databaseTime();
      await as(ids.admin, () =>
        scoped.reportedEntityHandle.update({
          where: { id: handleA.id },
          data: {
            reviewStatus: "questionable",
            reviewNote: "  Needs another internal check.  ",
            reviewedAt: forgedTime,
            reviewedByUserId: ids.editor,
          },
        })
      );
      const after = await databaseTime();
      const stored = await admin.reportedEntityHandle.findUniqueOrThrow({
        where: { id: handleA.id },
      });
      assert.equal(stored.reviewStatus, "questionable");
      assert.equal(stored.reviewNote, "Needs another internal check.");
      assert.equal(stored.reviewedByUserId, ids.admin);
      assert.notEqual(stored.reviewedAt?.toISOString(), forgedTime.toISOString());
      assert.ok(stored.reviewedAt);
      assert.ok(stored.reviewedAt.getTime() >= before.getTime());
      assert.ok(stored.reviewedAt.getTime() <= after.getTime());

      await reset(ids.admin, handleA.id);
    }
  );

  await check(
    "internal handle review: insert and validation paths cannot smuggle reviewed state",
    async () => {
      const insertedId = randomUUID();
      try {
        await as(ids.editor, () =>
          scoped.reportedEntityHandle.create({
            data: {
              id: insertedId,
              reportedEntityId: ids.entityA,
              handle: `forged-review-${insertedId}`,
              reviewStatus: "consistent",
              reviewNote: "Forged at insert",
              reviewedAt: new Date("2100-01-01T00:00:00.000Z"),
              reviewedByUserId: ids.editor,
            },
          })
        );
        const inserted = await admin.reportedEntityHandle.findUniqueOrThrow({
          where: { id: insertedId },
        });
        assert.equal(inserted.reviewStatus, "unreviewed");
        assert.equal(inserted.reviewNote, null);
        assert.equal(inserted.reviewedAt, null);
        assert.equal(inserted.reviewedByUserId, null);

        await assert.rejects(() =>
          as(ids.admin, () =>
            scoped.reportedEntityHandle.update({
              where: { id: handleA.id },
              data: { reviewStatus: "consistent", reviewNote: "  " },
            })
          )
        );
        await assert.rejects(() =>
          as(ids.admin, () =>
            scoped.$executeRaw`
              UPDATE "ReportedEntityHandle"
              SET "reviewStatus" = 'externally_verified',
                  "reviewNote" = 'invalid state'
              WHERE id = ${handleA.id}::uuid
            `
          )
        );
        const unchanged = await admin.reportedEntityHandle.findUniqueOrThrow({
          where: { id: handleA.id },
        });
        assert.equal(unchanged.reviewStatus, "unreviewed");
        assert.equal(unchanged.reviewedByUserId, null);
      } finally {
        await admin.reportedEntityHandle.deleteMany({
          where: { id: insertedId },
        });
      }
    }
  );

  await check(
    "internal handle review: RLS keeps review mutations admin- and tenant-scoped",
    async () => {
      for (const userId of [ids.editor, ids.reader, ids.outsider]) {
        await assert.rejects(() =>
          as(userId, () =>
            scoped.reportedEntityHandle.update({
              where: { id: handleA.id },
              data: {
                reviewStatus: "obsolete",
                reviewNote: "Unauthorized review",
              },
            })
          )
        );
      }
      await assert.rejects(() =>
        as(ids.admin, () =>
          scoped.reportedEntityHandle.update({
            where: { id: handleB.id },
            data: {
              reviewStatus: "obsolete",
              reviewNote: "Cross-tenant review",
            },
          })
        )
      );

      await as(ids.superadmin, () =>
        scoped.reportedEntityHandle.update({
          where: { id: handleB.id },
          data: {
            reviewStatus: "obsolete",
            reviewNote: "Global internal review",
          },
        })
      );
      const foreign = await admin.reportedEntityHandle.findUniqueOrThrow({
        where: { id: handleB.id },
      });
      assert.equal(foreign.reviewedByUserId, ids.superadmin);
      await reset(ids.superadmin, handleB.id);
    }
  );

  await check(
    "internal handle review: account deletion detaches identity without rewriting evidence",
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
        await as(reviewerId, () =>
          scoped.reportedEntityHandle.update({
            where: { id: handleId },
            data: {
              reviewStatus: "consistent",
              reviewNote: "Reviewed before account deletion",
            },
          })
        );
        const before = await admin.reportedEntityHandle.findUniqueOrThrow({
          where: { id: handleId },
        });
        assert.equal(before.reviewedByUserId, reviewerId);
        await admin.user.delete({ where: { id: reviewerId } });
        const after = await admin.reportedEntityHandle.findUniqueOrThrow({
          where: { id: handleId },
        });
        assert.equal(after.reviewStatus, before.reviewStatus);
        assert.equal(after.reviewNote, before.reviewNote);
        assert.equal(after.reviewedAt?.toISOString(), before.reviewedAt?.toISOString());
        assert.equal(after.reviewedByUserId, null);
      } finally {
        await admin.reportedEntity.deleteMany({ where: { id: entityId } });
        await admin.user.deleteMany({ where: { id: reviewerId } });
      }
    }
  );
}
