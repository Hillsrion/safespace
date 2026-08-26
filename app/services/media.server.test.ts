import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";
import type { MediaStorage } from "./media-storage.server";
import {
  deleteMedia,
  getAuthorizedMediaObject,
  uploadMedia,
} from "./media.server";

const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";
const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SPACE_ID = "44444444-4444-4444-8444-444444444444";
const POST_ID = "55555555-5555-4555-8555-555555555555";
const MEDIA_ID = "66666666-6666-4666-8666-666666666666";
const STORAGE_KEY = `evidence/v1/${"A".repeat(43)}.jpg`;

function jpegWithExif(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9,
  ]);
}

function storageMock() {
  return {
    putObject: vi.fn(async () => undefined),
    getObject: vi.fn(async () => ({
      acceptRanges: "bytes",
      body: new Response(Uint8Array.from([1, 2, 3])).body,
      contentLength: 3,
      contentRange: null,
      contentType: "image/jpeg",
      status: 200,
    })),
    deleteObject: vi.fn(async () => undefined),
    createSignedDownloadUrl: vi.fn(async () => "https://signed.invalid/object"),
  } satisfies MediaStorage;
}

function database(options: {
  role?: string | null;
  postSpaceId?: string;
  postAuthorId?: string;
  postStatus?: "active" | "hidden";
  mediaAdminOnly?: boolean;
  mediaUploaderId?: string;
  discipline?: "restriction" | "suspension" | null;
} = {}) {
  const role = options.role === undefined ? "EDITOR" : options.role;
  const post = {
    id: POST_ID,
    spaceId: options.postSpaceId ?? SPACE_ID,
    authorId: options.postAuthorId ?? ACTOR_ID,
    isAnonymous: true,
    status: options.postStatus ?? "active",
  };
  const mediaRow = {
    id: MEDIA_ID,
    uploaderId: options.mediaUploaderId ?? ACTOR_ID,
    storageKey: STORAGE_KEY,
    fileName: "proof.jpg",
    mimeType: "image/jpeg",
    fileSize: 10,
    metadataStripped: true,
    post: {
      id: POST_ID,
      authorId: post.authorId,
      spaceId: post.spaceId,
      isAdminOnly: options.mediaAdminOnly ?? false,
      isAnonymous: post.isAnonymous,
      status: post.status,
    },
  };
  const tx = {
    user: { findUnique: vi.fn(async () => ({ isSuperAdmin: false })) },
    userSpaceMembership: {
      findUnique: vi.fn(async () => (role ? { role } : null)),
    },
    disciplinaryAction: {
      findFirst: vi.fn(async () =>
        options.discipline ? { kind: options.discipline } : null
      ),
    },
    post: { findUnique: vi.fn(async () => post) },
    media: {
      aggregate: vi.fn(async () => ({ _count: { _all: 0 }, _sum: { fileSize: null } })),
      create: vi.fn(async ({ data }) => ({
        id: MEDIA_ID,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        originalFileSize: data.originalFileSize,
        metadataStripped: data.metadataStripped,
        metadataRemoved: data.metadataRemoved,
        removedMetadataKinds: data.removedMetadataKinds,
      })),
      findUnique: vi.fn(async () => mediaRow),
      delete: vi.fn(async () => mediaRow),
    },
    mediaDeletionJob: {
      createMany: vi.fn(async () => ({ count: 1 })),
    },
    auditLog: { create: vi.fn(async () => ({ id: "audit-id" })) },
  };
  const mediaDeletionJob = {
    createMany: vi.fn(async () => ({ count: 1 })),
    findMany: vi.fn(async () => [{ id: "job-id", storageKey: STORAGE_KEY }]),
    deleteMany: vi.fn(async () => ({ count: 1 })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  };
  const client = {
    $transaction: vi.fn(async (operation: (transaction: typeof tx) => unknown) => operation(tx)),
    mediaDeletionJob,
  } as unknown as PrismaClient;
  return { client, mediaDeletionJob, tx };
}

describe("secure media authorization", () => {
  it("does not let a post ID from another space drive an upload", async () => {
    const db = database({ postSpaceId: OTHER_SPACE_ID });
    const storage = storageMock();
    await expect(
      uploadMedia(
        { id: ACTOR_ID },
        {
          bytes: jpegWithExif(),
          declaredMimeType: "image/jpeg",
          fileName: "proof.jpg",
          postId: POST_ID,
          spaceId: SPACE_ID,
        },
        { client: db.client, storage }
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(db.tx.media.create).not.toHaveBeenCalled();
  });

  it("strips metadata before private storage and persists integrity indicators", async () => {
    const db = database();
    const storage = storageMock();
    const response = await uploadMedia(
      { id: ACTOR_ID },
      {
        bytes: jpegWithExif(),
        declaredMimeType: "image/jpeg",
        fileName: "../../private-person.exe",
        postId: POST_ID,
        spaceId: SPACE_ID,
      },
      { client: db.client, storage }
    );

    expect(storage.putObject).toHaveBeenCalledOnce();
    const stored = storage.putObject.mock.calls[0][0];
    expect(stored.key).toMatch(/^evidence\/v1\/[A-Za-z0-9_-]{43}\.jpg$/);
    expect(stored.key).not.toContain(ACTOR_ID);
    expect(stored.key).not.toContain(POST_ID);
    expect(new TextDecoder().decode(stored.body)).not.toContain("Exif");
    expect(db.tx.media.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fileName: "private-person.jpg",
          metadataStripped: true,
          metadataRemoved: true,
          removedMetadataKinds: ["EXIF/XMP"],
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      })
    );
    expect(response).toMatchObject({
      mediaId: MEDIA_ID,
      metadataStripped: true,
      metadataRemoved: true,
      removedMetadataKinds: ["EXIF/XMP"],
    });
    expect(db.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: null,
          action: "media_upload",
        }),
      })
    );
  });

  it("does not upload bytes when an active restriction blocks the actor", async () => {
    const db = database({ discipline: "restriction" });
    const storage = storageMock();

    await expect(
      uploadMedia(
        { id: ACTOR_ID },
        {
          bytes: jpegWithExif(),
          declaredMimeType: "image/jpeg",
          fileName: "proof.jpg",
          postId: POST_ID,
          spaceId: SPACE_ID,
        },
        { client: db.client, storage }
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("checks post capacity before writing an object to storage", async () => {
    const db = database();
    db.tx.media.aggregate.mockResolvedValue({
      _count: { _all: 10 },
      _sum: { fileSize: 500 },
    });
    const storage = storageMock();

    await expect(
      uploadMedia(
        { id: ACTOR_ID },
        {
          bytes: jpegWithExif(),
          declaredMimeType: "image/jpeg",
          fileName: "proof.jpg",
          postId: POST_ID,
          spaceId: SPACE_ID,
        },
        { client: db.client, storage }
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it("returns a uniform 404 for admin-only media requested by an Editor", async () => {
    const db = database({ role: "EDITOR", mediaAdminOnly: true });
    const storage = storageMock();
    await expect(
      getAuthorizedMediaObject({ id: ACTOR_ID }, MEDIA_ID, { client: db.client, storage })
    ).rejects.toMatchObject({ status: 404 });
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it("allows an active read-only member to stream ordinary evidence", async () => {
    const db = database({ role: "READ_ONLY" });
    const storage = storageMock();
    await expect(
      getAuthorizedMediaObject({ id: ACTOR_ID }, MEDIA_ID, {
        client: db.client,
        storage,
        range: "bytes=0-2",
      })
    ).resolves.toMatchObject({ mediaId: MEDIA_ID, mimeType: "image/jpeg" });
    expect(storage.getObject).toHaveBeenCalledWith(STORAGE_KEY, { range: "bytes=0-2" });
  });

  it("does not let an Editor delete another author's evidence", async () => {
    const db = database({ postAuthorId: OTHER_ID, mediaUploaderId: OTHER_ID });
    const storage = storageMock();
    await expect(
      deleteMedia({ id: ACTOR_ID }, MEDIA_ID, { client: db.client, storage })
    ).rejects.toMatchObject({ status: 403 });
    expect(db.tx.media.delete).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("durably queues deletion and reports a private R2 retry when immediate deletion fails", async () => {
    const db = database();
    const storage = storageMock();
    storage.deleteObject.mockRejectedValueOnce(new Error("R2 unavailable"));

    await expect(
      deleteMedia({ id: ACTOR_ID }, MEDIA_ID, { client: db.client, storage })
    ).resolves.toEqual({ deletedMediaId: MEDIA_ID, storageDeletionPending: true });
    expect(db.tx.mediaDeletionJob.createMany).toHaveBeenCalledWith({
      data: [
        {
          storageKey: STORAGE_KEY,
          requestedByUserId: ACTOR_ID,
          spaceId: SPACE_ID,
        },
      ],
      skipDuplicates: true,
    });
    expect(db.tx.media.delete).toHaveBeenCalledWith({ where: { id: MEDIA_ID } });
    expect(db.mediaDeletionJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-id" },
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      })
    );
  });
});
