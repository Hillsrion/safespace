/** Additional disposable-PostgreSQL checks; main verify-rls wires this module. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../app/generated/prisma";
import { runWithDbContext } from "../app/db/context.server";
import { deleteMedia, updateMediaEvidence, uploadMedia } from "../app/services/media.server";
import { HttpError } from "../app/lib/api/http-error";
import { jpegWithExif } from "../app/lib/media/fixtures.server.test-support";
import type { MediaStorage } from "../app/services/media-storage.server";
import { createReport, updateReport } from "../app/db/repositories/posts/write.server";

type Check = (name: string, operation: () => Promise<void>) => Promise<void>;

export async function verifyEvidenceOrganization({ admin, scoped, ids, check }: { admin: PrismaClient; scoped: PrismaClient; ids: { admin: string; editor: string; reader: string; outsider: string; spaceA: string; spaceB: string }; check: Check }) {
  let entityId: string | undefined; let postId: string | undefined;
  const key = `evidence/v1/${"a".repeat(11)}${randomUUID().replaceAll("-", "")}.jpg`;
  const as = <T>(id: string, operation: () => T) => runWithDbContext({ mode: "user", userId: id, isSuperAdmin: false }, operation);
  await check("anonymous reports: create and edit commit detached entity/post audits without exposing them", async () => {
    const actor = { id: ids.editor, isSuperAdmin: false };
    const handle = randomUUID().replaceAll("-", "").slice(0, 25);
    const entity = { name: `Anonymous report ${handle}`, handles: [handle] };
    let created: Awaited<ReturnType<typeof createReport>> | undefined;
    try {
      created = await as(ids.editor, () => createReport(actor, { spaceId: ids.spaceA, entity, description: "Anonymous fixture", isAnonymous: true, isAdminOnly: false }, scoped));
      const updated = await as(ids.editor, () => updateReport(created!.post.id, actor, { description: "Edited anonymously", entity: { ...entity, handles: [handle, `${handle}_2`] } }, scoped));
      assert.equal(updated.post.description, "Edited anonymously");
      assert.equal(updated.post.isAnonymous, true);
      const targets = [created.post.id, created.post.reportedEntity.id];
      const audits = await admin.auditLog.findMany({ where: { targetEntityId: { in: targets } } });
      assert.deepEqual(audits.map(({ action }) => action).sort(), ["entity_add", "entity_update", "post_create", "post_update"]);
      assert.ok(audits.every(({ actorUserId }) => actorUserId === null));
      assert.equal(await as(ids.editor, () => scoped.auditLog.count({ where: { targetEntityId: { in: targets } } })), 0);
    } finally {
      if (created) {
        await admin.post.delete({ where: { id: created.post.id } });
        await admin.reportedEntity.delete({ where: { id: created.post.reportedEntity.id } });
      }
    }
  });
  try {
    const entity = await admin.reportedEntity.create({ data: { name: `Evidence ${randomUUID()}`, spaceId: ids.spaceA } }); entityId = entity.id;
    const post = await admin.post.create({ data: { spaceId: ids.spaceA, reportedEntityId: entity.id, authorId: ids.editor, isAnonymous: true, description: "Evidence organization fixture" } }); postId = post.id;
    const media = await admin.media.create({ data: { postId: post.id, uploaderId: ids.editor, storageKey: key, fileName: "fixture.jpg", mimeType: "image/jpeg", fileSize: 1 } });
    const second = await admin.media.create({ data: { postId: post.id, uploaderId: ids.editor, storageKey: `${key}-second`, fileName: "second.jpg", mimeType: "image/jpeg", fileSize: 1, sortOrder: 4 } });
    const revision = async () => (await admin.post.findUniqueOrThrow({ where: { id: post.id } })).contentRevision;
    const http = (status: number) => (error: unknown) => error instanceof HttpError && error.status === status;
    const update = (actorId: string, input: Parameters<typeof updateMediaEvidence>[2]) => as(actorId, () => updateMediaEvidence({ id: actorId }, media.id, input, { client: scoped }));
    await check("evidence organization: RLS prevents an outsider from classifying another space's media", async () => {
    await assert.rejects(() => as(ids.outsider, () => scoped.media.update({ where: { id: media.id }, data: { evidenceCategory: "document" } })));
    });
    await check("evidence organization: category/caption updates invalidate the post review revision", async () => {
    const before = await admin.post.findUniqueOrThrow({ where: { id: post.id } });
    await as(ids.editor, () => scoped.media.update({ where: { id: media.id }, data: { evidenceCategory: "document", caption: "Signed contract" } }));
    const after = await admin.post.findUniqueOrThrow({ where: { id: post.id } });
    assert.ok(after.contentRevision > before.contentRevision);
    assert.equal((await admin.media.findUniqueOrThrow({ where: { id: media.id } })).caption, "Signed contract");
    });
    await check("evidence organization: database constraints reject invalid category, caption and order", async () => {
    await assert.rejects(() => admin.$executeRawUnsafe(`UPDATE public."Media" SET "evidenceCategory" = 'unsafe' WHERE id = '${media.id}'`));
    await assert.rejects(() => admin.$executeRawUnsafe(`UPDATE public."Media" SET caption = '${"x".repeat(281)}' WHERE id = '${media.id}'`));
    await assert.rejects(() => admin.$executeRawUnsafe(`UPDATE public."Media" SET "sortOrder" = -1 WHERE id = '${media.id}'`));
    });
    await check("anonymous evidence: upload/delete commit without granting authors access to anonymous audits", async () => {
      const storedKeys = new Set<string>();
      const storage: MediaStorage = {
        putObject: async ({ key }) => { storedKeys.add(key); },
        deleteObject: async (key) => { storedKeys.delete(key); },
        getObject: async () => { throw new Error("Unexpected download in fixture"); },
        createSignedDownloadUrl: async () => { throw new Error("Unexpected signing in fixture"); },
      };
      const before = await revision();
      const uploaded = await as(ids.editor, () => uploadMedia({ id: ids.editor }, { spaceId: ids.spaceA, postId: post.id, bytes: jpegWithExif(), declaredMimeType: "image/jpeg", fileName: "fixture.jpg" }, { client: scoped, storage }));
      assert.equal(uploaded.sortOrder, 5, "Append after max position, not after attachment count");
      assert.ok(uploaded.contentRevision > before);
      assert.equal(uploaded.evidenceCategory, "unclassified");
      assert.equal(uploaded.caption, null);
      assert.equal(storedKeys.size, 1);
      const removed = await as(ids.editor, () => deleteMedia({ id: ids.editor }, uploaded.mediaId, { client: scoped, storage }));
      assert.ok(removed.contentRevision > uploaded.contentRevision);
      assert.equal(removed.storageDeletionPending, false);
      assert.equal(storedKeys.size, 0);
      assert.equal(await as(ids.editor, () => scoped.auditLog.count({ where: { targetEntityId: uploaded.mediaId } })), 0);
      const audits = await admin.auditLog.findMany({ where: { targetEntityId: uploaded.mediaId }, orderBy: { createdAt: "asc" } });
      assert.deepEqual(audits.map(({ action }) => action), ["media_upload", "media_delete"]);
      assert.ok(audits.every(({ actorUserId }) => actorUserId === null));
    });
    await check("evidence organization: service reorders the complete set atomically with anonymous content-free audit", async () => {
      const expectedRevision = await revision();
      const result = await update(ids.editor, { expectedRevision, orderedMediaIds: [second.id, media.id], caption: "Confidential caption" });
      assert.deepEqual(result.orderedMediaIds, [second.id, media.id]);
      assert.equal(result.media.sortOrder, 1);
      assert.ok(result.contentRevision > expectedRevision);
      assert.deepEqual((await admin.media.findMany({ where: { postId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })).map(({ id }) => id), result.orderedMediaIds);
      const audit = await admin.auditLog.findFirstOrThrow({ where: { action: "media_update", targetEntityId: media.id } });
      assert.equal(audit.actorUserId, null);
      assert.ok(!JSON.stringify(audit.details).includes("Confidential caption"));
      await assert.rejects(() => update(ids.editor, { expectedRevision, caption: "Stale overwrite" }), http(409));
      const count = await admin.auditLog.count({ where: { action: "media_update", targetEntityId: media.id } });
      const noOp = await update(ids.editor, { expectedRevision: result.contentRevision, orderedMediaIds: [second.id, media.id], caption: "Confidential caption" });
      assert.equal(noOp.contentRevision, result.contentRevision);
      assert.equal(await admin.auditLog.count({ where: { action: "media_update", targetEntityId: media.id } }), count);
    });
    await check("evidence organization: service rejects foreign/partial sets and effective read-only access", async () => {
      const expectedRevision = await revision();
      await assert.rejects(() => update(ids.editor, { expectedRevision, orderedMediaIds: [media.id] }), http(400));
      await assert.rejects(() => update(ids.editor, { expectedRevision, orderedMediaIds: [media.id, randomUUID()] }), http(400));
      await assert.rejects(() => update(ids.reader, { expectedRevision, caption: "Forbidden" }), http(403));
      await assert.rejects(() => update(ids.outsider, { expectedRevision, caption: "Forbidden" }), http(404));
      assert.equal(await revision(), expectedRevision);
    });
    await check("evidence organization: concurrent saves accept one winner and reject stale overwrites", async () => {
      const expectedRevision = await revision();
      const results = await Promise.allSettled([
        update(ids.editor, { expectedRevision, caption: "Concurrent A" }),
        update(ids.editor, { expectedRevision, caption: "Concurrent B" }),
      ]);
      assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      assert.ok(http(409)(rejected.reason));
    });
    await check("evidence organization: only moderators can reorder another uploader's evidence", async () => {
      const third = await admin.media.create({ data: { postId: post.id, uploaderId: ids.admin, storageKey: `${key}-third`, fileName: "third.jpg", mimeType: "image/jpeg", fileSize: 1, sortOrder: 9 } });
      const expectedRevision = await revision();
      const orderedMediaIds = [third.id, media.id, second.id];
      await assert.rejects(() => update(ids.editor, { expectedRevision, orderedMediaIds }), http(403));
      const result = await update(ids.admin, { expectedRevision, orderedMediaIds });
      assert.deepEqual(result.orderedMediaIds, orderedMediaIds);
      await admin.post.update({ where: { id: post.id }, data: { status: "hidden" } });
      await assert.rejects(() => update(ids.editor, { expectedRevision: result.contentRevision, caption: "Hidden edit" }), (error) => http(403)(error) || http(404)(error));
    });
  } finally {
    if (postId) await admin.media.deleteMany({ where: { postId } });
    if (postId) await admin.post.deleteMany({ where: { id: postId } });
    if (entityId) await admin.reportedEntity.deleteMany({ where: { id: entityId } });
    await admin.mediaDeletionJob.deleteMany({ where: { storageKey: { startsWith: key } } });
  }
}
