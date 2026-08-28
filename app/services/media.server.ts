import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { errors, HttpError } from "~/lib/api/http-error";
import {
  createPrivateStorageKey,
  MEDIA_MAX_FILES_PER_POST,
  MEDIA_MAX_TOTAL_BYTES_PER_POST,
  MediaValidationError,
  sanitizeOriginalFileName,
  validateMediaBytes,
} from "~/lib/media/media-policy.server";
import {
  MediaProcessingError,
  stripMediaMetadata,
} from "~/lib/media/metadata-stripper.server";
import {
  enqueueMediaDeletionJobs,
  processMediaDeletionJobs,
} from "~/services/media-deletion.server";
import {
  getMediaStorage,
  type MediaStorage,
} from "~/services/media-storage.server";
import { getEffectiveSpaceAccess } from "~/services/effective-space-access.server";
import { updateEvidenceSchema, type UpdateEvidenceInput } from "~/lib/evidence";
export { EVIDENCE_CATEGORIES, type EvidenceCategory } from "~/lib/evidence";

type Actor = { id: string };
type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
type AuthorizedRole = "EDITOR" | "MODERATOR" | "ADMIN" | "SUPER_ADMIN";

export type MediaUploadResponse = {
  contentRevision: number;
  evidenceCategory: string;
  caption: string | null;
  sortOrder: number;
  mediaId: string;
  url: string;
  mimeType: string;
  fileSize: number;
  originalFileSize: number;
  metadataStripped: boolean;
  metadataRemoved: boolean;
  removedMetadataKinds: string[];
};

type ServiceOptions = {
  client?: PrismaClient;
  storage?: MediaStorage;
};

const MAX_TRANSACTION_ATTEMPTS = 3;

function isRetryableTransactionConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

async function runSerializable<T>(
  client: PrismaClient,
  operation: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await client.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isRetryableTransactionConflict(error)) throw error;
      if (attempt === MAX_TRANSACTION_ATTEMPTS) {
        throw errors.conflict("The post changed concurrently; retry the media request");
      }
    }
  }
  throw new Error("Unreachable transaction retry state");
}

async function currentRole(
  tx: TransactionClient,
  actorId: string,
  spaceId: string
): Promise<AuthorizedRole | "READ_ONLY" | null> {
  const access = await getEffectiveSpaceAccess(tx, actorId, spaceId);
  if (access.isSuperAdmin) return "SUPER_ADMIN";
  return access.role;
}

async function requireUploadAccess(
  tx: TransactionClient,
  actorId: string,
  spaceId: string,
  postId: string
): Promise<{ authorId: string | null; isAnonymous: boolean }> {
  const post = await tx.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      spaceId: true,
      authorId: true,
      isAnonymous: true,
      status: true,
    },
  });
  if (!post || post.spaceId !== spaceId) throw errors.notFound("Post not found");

  const role = await currentRole(tx, actorId, spaceId);
  if (role === null) throw errors.notFound("Post not found");
  if (role === "READ_ONLY") {
    throw errors.forbidden("An active Editor membership or higher is required");
  }
  if (role === "EDITOR" && (post.authorId !== actorId || post.status !== "active")) {
    throw errors.forbidden("Editors may attach evidence only to their own active posts");
  }
  return { authorId: post.authorId, isAnonymous: post.isAnonymous };
}

async function requireCapacity(
  tx: TransactionClient,
  postId: string,
  nextFileSize: number
): Promise<void> {
  const aggregate = await tx.media.aggregate({
    where: { postId },
    _count: { _all: true },
    _sum: { fileSize: true },
  });
  if (aggregate._count._all >= MEDIA_MAX_FILES_PER_POST) {
    throw errors.badRequest(`A post may contain at most ${MEDIA_MAX_FILES_PER_POST} media files`);
  }
  if ((aggregate._sum.fileSize ?? 0) + nextFileSize > MEDIA_MAX_TOTAL_BYTES_PER_POST) {
    throw errors.badRequest("The media attached to this post exceed the total size limit");
  }
}

export function mediaContentDisposition(fileName: string): string {
  const encoded = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `inline; filename="evidence"; filename*=UTF-8''${encoded}`;
}

async function compensateUnreferencedObject(
  client: PrismaClient,
  storage: MediaStorage,
  storageKey: string,
  context: { requestedByUserId: string; spaceId: string }
): Promise<void> {
  try {
    await storage.deleteObject(storageKey);
  } catch {
    await client.mediaDeletionJob.createMany({
      data: [{ storageKey, ...context }],
      skipDuplicates: true,
    });
  }
}

export async function uploadMedia(
  actor: Actor,
  input: { bytes: Uint8Array; declaredMimeType: string; fileName: string; postId: string; spaceId: string },
  options: ServiceOptions = {}
): Promise<MediaUploadResponse> {
  const client = options.client ?? prisma;
  const storage = options.storage ?? getMediaStorage();

  // Cheap authorization is done before CPU/memory-heavy processing. The same
  // authorization is repeated in the final serializable write transaction.
  await client.$transaction((tx) => requireUploadAccess(tx, actor.id, input.spaceId, input.postId), {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });

  let validated: ReturnType<typeof validateMediaBytes>;
  let processed: Awaited<ReturnType<typeof stripMediaMetadata>>;
  try {
    validated = validateMediaBytes({ bytes: input.bytes, declaredMimeType: input.declaredMimeType });
    processed = await stripMediaMetadata(input.bytes, validated.mimeType);
  } catch (error) {
    if (error instanceof MediaValidationError || error instanceof MediaProcessingError) {
      if (error instanceof MediaProcessingError && error.reason === "processor_unavailable") {
        throw new HttpError(503, "Media processing is temporarily unavailable", "server_error:api");
      }
      throw errors.badRequest(error.message, "bad_request:api", {
        reason: error.reason,
      });
    }
    throw error;
  }
  const fileName = sanitizeOriginalFileName(input.fileName, validated.mimeType);
  const storageKey = createPrivateStorageKey(validated.mimeType);
  const disposition = mediaContentDisposition(fileName);

  // Re-authorize after processing and enforce capacity before any bytes reach
  // object storage. The final serializable transaction repeats both checks to
  // close membership, discipline, and concurrent-upload races.
  await client.$transaction(async (tx) => {
    await requireUploadAccess(tx, actor.id, input.spaceId, input.postId);
    await requireCapacity(tx, input.postId, processed.bytes.byteLength);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  await storage.putObject({
    key: storageKey,
    body: processed.bytes,
    contentType: validated.mimeType,
    contentDisposition: disposition,
  });

  try {
    const media = await runSerializable(client, async (tx) => {
      const postAccess = await requireUploadAccess(
        tx,
        actor.id,
        input.spaceId,
        input.postId
      );
      await requireCapacity(tx, input.postId, processed.bytes.byteLength);
      const created = await tx.media.create({
        data: {
          postId: input.postId,
          uploaderId: actor.id,
          storageKey,
          fileName,
          mimeType: validated.mimeType,
          fileSize: processed.bytes.byteLength,
          originalFileSize: input.bytes.byteLength,
          sha256: createHash("sha256").update(processed.bytes).digest("hex"),
          metadataStripped: processed.metadataStripped,
          metadataRemoved: processed.metadataRemoved,
          removedMetadataKinds: processed.removedMetadataKinds,
          sortOrder: ((await tx.media.aggregate({ where: { postId: input.postId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1,
        },
        select: {
          id: true,
          mimeType: true,
          fileSize: true,
          originalFileSize: true,
          metadataStripped: true,
          metadataRemoved: true,
          removedMetadataKinds: true,
          evidenceCategory: true, caption: true, sortOrder: true,
        },
      });
      // Anonymous audits are deliberately not readable by their author. Avoid
      // INSERT RETURNING, which would require SELECT and roll back under RLS.
      await tx.auditLog.createMany({
        data: {
          actorUserId:
            postAccess.isAnonymous && postAccess.authorId === actor.id
              ? null
              : actor.id,
          action: "media_upload",
          targetEntityType: "Media",
          targetEntityId: created.id,
          spaceId: input.spaceId,
          details: {
            postId: input.postId,
            mimeType: validated.mimeType,
            fileSize: processed.bytes.byteLength,
            metadataRemoved: processed.metadataRemoved,
          },
        },
      });
      const post = await tx.post.findUniqueOrThrow({ where: { id: input.postId }, select: { contentRevision: true } });
      return { ...created, contentRevision: post.contentRevision };
    });

    return {
      mediaId: media.id,
      contentRevision: media.contentRevision, evidenceCategory: media.evidenceCategory, caption: media.caption, sortOrder: media.sortOrder,
      url: `/resources/api/media/${media.id}`,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      originalFileSize: media.originalFileSize ?? input.bytes.byteLength,
      metadataStripped: media.metadataStripped,
      metadataRemoved: media.metadataRemoved,
      removedMetadataKinds: Array.isArray(media.removedMetadataKinds)
        ? media.removedMetadataKinds.filter((item): item is string => typeof item === "string")
        : [],
    };
  } catch (error) {
    await compensateUnreferencedObject(client, storage, storageKey, {
      requestedByUserId: actor.id,
      spaceId: input.spaceId,
    });
    throw error;
  }
}

async function requireDownloadAccess(
  tx: TransactionClient,
  actorId: string,
  mediaId: string
) {
  const media = await tx.media.findUnique({
    where: { id: mediaId },
    select: {
      id: true,
      storageKey: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      metadataStripped: true,
      post: {
        select: { spaceId: true, isAdminOnly: true, status: true },
      },
    },
  });
  if (!media) throw errors.notFound("Media not found");
  const role = await currentRole(tx, actorId, media.post.spaceId);
  const mayModerate = role === "MODERATOR" || role === "ADMIN" || role === "SUPER_ADMIN";
  if (
    role === null ||
    (media.post.isAdminOnly && !mayModerate) ||
    (media.post.status !== "active" && !mayModerate)
  ) {
    // Uniform 404 prevents media IDs from becoming a cross-space/admin-only oracle.
    throw errors.notFound("Media not found");
  }
  return media;
}

export async function getAuthorizedMediaDownload(
  actor: Actor,
  mediaId: string,
  options: ServiceOptions & { expiresInSeconds?: number } = {}
) {
  const client = options.client ?? prisma;
  const media = await client.$transaction(
    (tx) => requireDownloadAccess(tx, actor.id, mediaId),
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
  const storage = options.storage ?? getMediaStorage();
  return {
    mediaId: media.id,
    mimeType: media.mimeType,
    fileSize: media.fileSize,
    metadataStripped: media.metadataStripped,
    signedUrl: await storage.createSignedDownloadUrl({
      key: media.storageKey,
      contentType: media.mimeType,
      contentDisposition: mediaContentDisposition(media.fileName),
      expiresInSeconds: options.expiresInSeconds,
    }),
  };
}

/**
 * Same-origin proxy download. The R2 request itself is SigV4-authenticated and
 * supports one byte range, while the browser never receives storage credentials.
 */
export async function getAuthorizedMediaObject(
  actor: Actor,
  mediaId: string,
  options: ServiceOptions & { range?: string } = {}
) {
  const client = options.client ?? prisma;
  const media = await client.$transaction(
    (tx) => requireDownloadAccess(tx, actor.id, mediaId),
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  );
  const storage = options.storage ?? getMediaStorage();
  const object = await storage.getObject(media.storageKey, { range: options.range });
  if (!object.body) throw errors.internalServerError("Stored media returned an empty body");
  return {
    body: object.body,
    contentDisposition: mediaContentDisposition(media.fileName),
    contentLength: object.contentLength,
    contentRange: object.contentRange,
    fileSize: media.fileSize,
    mediaId: media.id,
    mimeType: media.mimeType,
    status: object.status === 206 ? 206 : 200,
  };
}

export async function deleteMedia(
  actor: Actor,
  mediaId: string,
  options: ServiceOptions = {}
): Promise<{ deletedMediaId: string; storageDeletionPending: boolean; contentRevision: number }> {
  const client = options.client ?? prisma;
  const outcome = await runSerializable(client, async (tx) => {
    const media = await tx.media.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        uploaderId: true,
        storageKey: true,
        post: {
          select: {
            id: true,
            authorId: true,
            isAnonymous: true,
            spaceId: true,
          },
        },
      },
    });
    if (!media) throw errors.notFound("Media not found");
    const role = await currentRole(tx, actor.id, media.post.spaceId);
    if (role === null) throw errors.notFound("Media not found");
    const mayModerate = role === "MODERATOR" || role === "ADMIN" || role === "SUPER_ADMIN";
    const editorOwnsEvidence =
      role === "EDITOR" && media.post.authorId === actor.id && media.uploaderId === actor.id;
    if (!mayModerate && !editorOwnsEvidence) {
      throw errors.forbidden("You do not have permission to delete this media");
    }

    const storageKeys = await enqueueMediaDeletionJobs(tx, [media.storageKey], {
      requestedByUserId: actor.id,
      spaceId: media.post.spaceId,
    });
    await tx.media.delete({ where: { id: media.id } });
    await tx.auditLog.createMany({
      data: {
        actorUserId:
          media.post.isAnonymous && media.post.authorId === actor.id
            ? null
            : actor.id,
        action: "media_delete",
        targetEntityType: "Media",
        targetEntityId: media.id,
        spaceId: media.post.spaceId,
        details: { postId: media.post.id },
      },
    });
    const post = await tx.post.findUniqueOrThrow({ where: { id: media.post.id }, select: { contentRevision: true } });
    return { mediaId: media.id, storageKeys, contentRevision: post.contentRevision };
  });

  const deletion = await processMediaDeletionJobs(outcome.storageKeys, {
    client,
    storage: options.storage,
  });
  return {
    deletedMediaId: outcome.mediaId,
    contentRevision: outcome.contentRevision,
    storageDeletionPending: deletion.failed > 0,
  };
}

export async function updateMediaEvidence(
  actor: Actor,
  mediaId: string,
  input: UpdateEvidenceInput,
  options: ServiceOptions = {}
) {
  const client = options.client ?? prisma;
  const parsed = updateEvidenceSchema.safeParse(input);
  if (!parsed.success) throw errors.badRequest("Invalid evidence metadata");
  input = parsed.data;
  return runSerializable(client, async (tx) => {
    const media = await tx.media.findUnique({ where: { id: mediaId }, select: { id: true, uploaderId: true, evidenceCategory: true, caption: true, sortOrder: true, post: { select: { id: true, authorId: true, spaceId: true, contentRevision: true, isAnonymous: true, status: true } } } });
    if (!media) throw errors.notFound("Media not found");
    const role = await currentRole(tx, actor.id, media.post.spaceId);
    if (role === null) throw errors.notFound("Media not found");
    const mayModerate = role === "MODERATOR" || role === "ADMIN" || role === "SUPER_ADMIN";
    const ownsEvidence = role === "EDITOR" && media.post.status === "active" && media.post.authorId === actor.id && media.uploaderId === actor.id;
    if (!mayModerate && !ownsEvidence) throw errors.forbidden("You do not have permission to edit this media");
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== media.post.contentRevision) throw errors.conflict("The post changed concurrently; reload before editing evidence");
    const rows = await tx.media.findMany({ where: { postId: media.post.id }, select: { id: true, uploaderId: true, sortOrder: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    let reordered = false;
    if (input.orderedMediaIds) {
      if (input.orderedMediaIds.length < 1 || input.orderedMediaIds.length > 10 || new Set(input.orderedMediaIds).size !== input.orderedMediaIds.length || !input.orderedMediaIds.includes(mediaId)) throw errors.badRequest("Evidence order is invalid");
      if (rows.length !== input.orderedMediaIds.length || rows.some(({ id }) => !input.orderedMediaIds!.includes(id))) throw errors.badRequest("Evidence order must contain exactly this post's evidence");
      if (!mayModerate && rows.some((row) => row.uploaderId !== actor.id)) throw errors.forbidden("Moderator rights are required to reorder another uploader's evidence");
      for (const [sortOrder, id] of input.orderedMediaIds.entries()) {
        if (rows.find((row) => row.id === id)?.sortOrder === sortOrder) continue;
        await tx.media.update({ where: { id }, data: { sortOrder } }); reordered = true;
      }
    }
    const changes = { ...(input.caption !== undefined && input.caption !== media.caption ? { caption: input.caption } : {}), ...(input.evidenceCategory && input.evidenceCategory !== media.evidenceCategory ? { evidenceCategory: input.evidenceCategory } : {}) };
    if (Object.keys(changes).length) await tx.media.update({ where: { id: mediaId }, data: changes });
    const updated = await tx.media.findUniqueOrThrow({ where: { id: mediaId }, select: { id: true, evidenceCategory: true, caption: true, sortOrder: true } });
    if (reordered || Object.keys(changes).length) await tx.auditLog.createMany({ data: { actorUserId: media.post.isAnonymous && media.post.authorId === actor.id ? null : actor.id, action: "media_update", targetEntityType: "Media", targetEntityId: mediaId, spaceId: media.post.spaceId, details: { postId: media.post.id, changedFields: Object.keys(changes), reordered } } });
    const revision = await tx.post.findUniqueOrThrow({ where: { id: media.post.id }, select: { contentRevision: true } });
    return { media: updated, contentRevision: revision.contentRevision, orderedMediaIds: input.orderedMediaIds ?? rows.map(({ id }) => id) };
  });
}
