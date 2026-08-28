import assert from "node:assert/strict";
import type { PrismaClient } from "../app/generated/prisma";
import { runWithDbContext } from "../app/db/context.server";
import { recordMemberSpaceActivity } from "../app/services/member-space-activity.server";
import { exportAccountData } from "../app/services/account-export.server";

type Fixture = { admin: string; moderator: string; editor: string; reader: string; outsider: string; superadmin: string; spaceA: string; spaceB: string };
type Check = (name: string, operation: () => Promise<void>) => Promise<void>;

export async function verifyMemberSpaceActivity({ admin, scoped, ids, check, suspendedId, restrictedId }: {
  admin: PrismaClient; scoped: PrismaClient; ids: Fixture; check: Check; suspendedId: string; restrictedId: string;
}) {
  const as = <T>(userId: string, operation: () => T) => runWithDbContext({ mode: "user", userId, isSuperAdmin: userId === ids.superadmin }, operation);
  const record = (userId: string, spaceId = ids.spaceA) => as(userId, () => recordMemberSpaceActivity(userId, spaceId, scoped));
  const today = (await admin.$queryRaw<Array<{ today: Date }>>`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS today`)[0].today;
  const ownKey = { userId: ids.editor, spaceId: ids.spaceA };
  const read = (userId: string, targetId: string) => as(userId, () => scoped.memberSpaceActivity.findUnique({ where: { userId_spaceId: { userId: targetId, spaceId: ids.spaceA } } }));

  await check("member activity: records one UTC day, no timestamp history, and concurrent duplicate visits are no-ops", async () => {
    await Promise.all([record(ids.editor), record(ids.editor)]);
    const item = await admin.memberSpaceActivity.findUniqueOrThrow({ where: { userId_spaceId: ownKey } });
    assert.equal(item.lastActiveDay.toISOString(), today.toISOString());
    assert.deepEqual(Object.keys(item).sort(), ["lastActiveDay", "spaceId", "userId"]);
    const version = async () => (await admin.$queryRaw<Array<{ version: string }>>`SELECT xmin::text AS version FROM "MemberSpaceActivity" WHERE "userId" = ${ids.editor}::uuid AND "spaceId" = ${ids.spaceA}::uuid`)[0].version;
    const before = await version();
    await record(ids.editor);
    assert.equal(await version(), before, "A repeat visit must not write the row again");
    assert.equal(await admin.memberSpaceActivity.count({ where: { userId: ids.editor, spaceId: ids.spaceB } }), 0);
  });
  await check("member activity: self and effective space administrators only; moderators and outsiders cannot read peers", async () => {
    assert.ok(await read(ids.editor, ids.editor));
    assert.ok(await read(ids.admin, ids.editor));
    assert.ok(await read(ids.superadmin, ids.editor));
    for (const userId of [ids.reader, ids.moderator, ids.outsider, suspendedId, restrictedId]) assert.equal(await read(userId, ids.editor), null);
    assert.equal(await as(ids.reader, () => scoped.memberSpaceActivity.count({ where: { spaceId: ids.spaceA } })), 0);
  });
  await check("member activity: read-only/restricted visits work; suspended, foreign, forged or missing contexts cannot record", async () => {
    await record(ids.reader); await record(restrictedId);
    assert.ok(await read(ids.reader, ids.reader));
    assert.ok(await read(restrictedId, restrictedId));
    await record(suspendedId); await record(ids.outsider);
    assert.equal(await admin.memberSpaceActivity.count({ where: { userId: { in: [suspendedId, ids.outsider] }, spaceId: ids.spaceA } }), 0);
    await assert.rejects(() => recordMemberSpaceActivity(ids.editor, ids.spaceA, scoped));
    await assert.rejects(() => as(ids.editor, () => recordMemberSpaceActivity(ids.admin, ids.spaceA, scoped)));
  });
  await check("member activity: raw SQL cannot forge a day, another member or another space", async () => {
    const changed = await as(ids.editor, () => scoped.memberSpaceActivity.update({ where: { userId_spaceId: ownKey }, data: { lastActiveDay: new Date("2100-01-01") } }));
    assert.equal(changed.lastActiveDay.toISOString(), today.toISOString());
    await assert.rejects(() => as(ids.editor, () => scoped.memberSpaceActivity.update({ where: { userId_spaceId: ownKey }, data: { spaceId: ids.spaceB } })));
    await assert.rejects(() => as(ids.admin, () => scoped.memberSpaceActivity.update({ where: { userId_spaceId: ownKey }, data: { lastActiveDay: today } })));
    await assert.rejects(() => as(ids.outsider, () => scoped.memberSpaceActivity.create({ data: { userId: ids.outsider, spaceId: ids.spaceA, lastActiveDay: today } })));
    await assert.rejects(() => as(ids.editor, () => scoped.memberSpaceActivity.create({ data: { userId: ids.admin, spaceId: ids.spaceA, lastActiveDay: today } })));
    assert.equal((await as(ids.admin, () => scoped.memberSpaceActivity.deleteMany({ where: ownKey }))).count, 0);
  });
  await check("member activity: own export survives suspension but membership removal erases its aggregate", async () => {
    // Owner-only setup simulates activity recorded before this member was suspended.
    await admin.memberSpaceActivity.create({ data: { userId: suspendedId, spaceId: ids.spaceA, lastActiveDay: today } });
    const exported = await as(suspendedId, () => exportAccountData({ id: suspendedId }, scoped));
    assert.deepEqual(exported.spaceActivity, [{ spaceId: ids.spaceA, lastActiveDay: today.toISOString().slice(0, 10) }]);
    await assert.rejects(() => as(suspendedId, () => scoped.memberSpaceActivity.update({ where: { userId_spaceId: { userId: suspendedId, spaceId: ids.spaceA } }, data: { lastActiveDay: today } })));
    const membership = await admin.userSpaceMembership.findUniqueOrThrow({ where: { userId_spaceId: { userId: ids.reader, spaceId: ids.spaceA } } });
    await admin.userSpaceMembership.delete({ where: { userId_spaceId: { userId: ids.reader, spaceId: ids.spaceA } } });
    try {
      assert.equal(await admin.memberSpaceActivity.count({ where: { userId: ids.reader, spaceId: ids.spaceA } }), 0);
      await record(ids.reader);
      assert.equal(await admin.memberSpaceActivity.count({ where: { userId: ids.reader, spaceId: ids.spaceA } }), 0);
    } finally { await admin.userSpaceMembership.create({ data: membership }); }
  });
}
