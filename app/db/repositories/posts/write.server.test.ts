import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../../generated/prisma";
import { HttpError } from "../../../lib/api/http-error";
import { createReport, updateReport } from "./write.server";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const POST_ID = "33333333-3333-4333-8333-333333333333";
const ENTITY_ID = "44444444-4444-4444-8444-444444444444";

function selectedPost(overrides: Record<string, unknown> = {}) {
  return {
    id: POST_ID,
    spaceId: SPACE_ID,
    description: "Report body",
    isAnonymous: true,
    isAdminOnly: false,
    severity: "high",
    verificationStatus: "verified",
    requiresSensitiveReview: true,
    contentRevision: 1,
    createdAt: new Date("2026-08-23T10:00:00.000Z"),
    updatedAt: new Date("2026-08-23T10:01:00.000Z"),
    reportedEntity: {
      id: ENTITY_ID,
      name: "Example Person",
      handles: [{ handle: "example.person" }],
    },
    ...overrides,
  };
}

function createDatabaseMock() {
  const tx = {
    user: { findUnique: vi.fn() },
    userSpaceMembership: { findUnique: vi.fn() },
    disciplinaryAction: { findFirst: vi.fn() },
    reportedEntity: { findMany: vi.fn(), create: vi.fn() },
    reportedEntityHandle: { createMany: vi.fn() },
    post: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn(), createMany: vi.fn() },
  };
  const client = {
    $transaction: vi.fn(async (operation: (transaction: typeof tx) => unknown) =>
      operation(tx)
    ),
  };

  tx.user.findUnique.mockResolvedValue({ isSuperAdmin: false });
  tx.userSpaceMembership.findUnique.mockResolvedValue({ role: "Editor" });
  tx.disciplinaryAction.findFirst.mockResolvedValue(null);
  tx.reportedEntity.findMany.mockResolvedValue([]);
  tx.reportedEntity.create.mockResolvedValue({ id: ENTITY_ID });
  tx.reportedEntityHandle.createMany.mockResolvedValue({ count: 0 });
  tx.post.create.mockResolvedValue(selectedPost());
  tx.post.update.mockResolvedValue(selectedPost());
  tx.auditLog.create.mockResolvedValue({ id: "audit-id" });
  tx.auditLog.createMany.mockResolvedValue({ count: 1 });

  return { tx, client: client as unknown as PrismaClient, transaction: client.$transaction };
}

const createInput = {
  spaceId: SPACE_ID,
  entity: { name: "Example Person", handles: ["example.person"] },
  description: "Report body",
  isAnonymous: true,
  isAdminOnly: false,
};

describe("report write service", () => {
  it("creates the entity, report and audits atomically for an Editor", async () => {
    const { tx, client, transaction } = createDatabaseMock();

    const response = await createReport(
      { id: ACTOR_ID, isSuperAdmin: false },
      createInput,
      client
    );

    expect(transaction).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: "Serializable" }
    );
    expect(tx.userSpaceMembership.findUnique).toHaveBeenCalledWith({
      where: { userId_spaceId: { userId: ACTOR_ID, spaceId: SPACE_ID } },
      select: { role: true },
    });
    expect(tx.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: ACTOR_ID,
          reportedEntityId: ENTITY_ID,
          isAnonymous: true,
        }),
      })
    );
    expect(tx.auditLog.createMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: [expect.objectContaining({
          action: "entity_add",
          actorUserId: null,
          targetEntityId: ENTITY_ID,
        })],
      })
    );
    expect(tx.auditLog.createMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: [expect.objectContaining({
          action: "post_create",
          actorUserId: null,
          targetEntityId: POST_ID,
        })],
      })
    );
    expect(response).toEqual({
      success: true,
      post: {
        id: POST_ID,
        spaceId: SPACE_ID,
        description: "Report body",
        isAnonymous: true,
        isAdminOnly: false,
        severity: "high",
        verificationStatus: "verified",
        requiresSensitiveReview: true,
        contentRevision: 1,
        createdAt: "2026-08-23T10:00:00.000Z",
        updatedAt: "2026-08-23T10:01:00.000Z",
        reportedEntity: {
          id: ENTITY_ID,
          name: "Example Person",
          handles: ["example.person"],
        },
      },
    });
    expect(response.post).not.toHaveProperty("authorId");
  });

  it("denies writes without an Editor-or-higher membership", async () => {
    const { tx, client } = createDatabaseMock();
    tx.userSpaceMembership.findUnique.mockResolvedValue({ role: "Read-only" });

    await expect(
      createReport(
        { id: ACTOR_ID, isSuperAdmin: false },
        createInput,
        client
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(tx.reportedEntity.findMany).not.toHaveBeenCalled();
    expect(tx.post.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("downgrades a restricted Editor to read-only before writing", async () => {
    const { tx, client } = createDatabaseMock();
    tx.disciplinaryAction.findFirst.mockResolvedValue({ kind: "restriction" });

    await expect(
      createReport(
        { id: ACTOR_ID, isSuperAdmin: false },
        createInput,
        client
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(tx.post.create).not.toHaveBeenCalled();
  });

  it("prevents Editors from self-certifying a report", async () => {
    const { tx, client } = createDatabaseMock();

    await expect(
      createReport(
        { id: ACTOR_ID, isSuperAdmin: false },
        { ...createInput, verificationStatus: "verified" },
        client
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(tx.reportedEntity.findMany).not.toHaveBeenCalled();
    expect(tx.post.create).not.toHaveBeenCalled();
  });

  it("re-reads super-admin rights inside the write transaction", async () => {
    const revoked = createDatabaseMock();
    revoked.tx.user.findUnique.mockResolvedValue({ isSuperAdmin: false });
    revoked.tx.userSpaceMembership.findUnique.mockResolvedValue(null);

    await expect(
      createReport(
        { id: ACTOR_ID, isSuperAdmin: true },
        createInput,
        revoked.client
      )
    ).rejects.toMatchObject({ status: 403 });

    const current = createDatabaseMock();
    current.tx.user.findUnique.mockResolvedValue({ isSuperAdmin: true });
    current.tx.userSpaceMembership.findUnique.mockResolvedValue(null);
    await expect(
      createReport(
        { id: ACTOR_ID, isSuperAdmin: false },
        createInput,
        current.client
      )
    ).resolves.toMatchObject({ success: true });
  });

  it("adds new handles to the uniquely matching named entity and audits it", async () => {
    const { tx, client } = createDatabaseMock();
    tx.reportedEntity.findMany.mockResolvedValue([
      {
        id: ENTITY_ID,
        name: "Example Person",
        handles: [{ handle: "example.person" }],
      },
    ]);

    await createReport(
      { id: ACTOR_ID, isSuperAdmin: false },
      {
        ...createInput,
        entity: {
          name: "Example Person",
          handles: ["example.person", "second.handle"],
        },
      },
      client
    );

    expect(tx.reportedEntityHandle.createMany).toHaveBeenCalledWith({
      data: [
        {
          reportedEntityId: ENTITY_ID,
          platform: "Instagram",
          handle: "second.handle",
        },
      ],
      skipDuplicates: true,
    });
    expect(tx.auditLog.createMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: [expect.objectContaining({
          action: "entity_update",
          details: { addedHandles: ["second.handle"] },
        })],
      })
    );
  });

  it("rejects ambiguous entity matches and handle/name collisions", async () => {
    const ambiguous = createDatabaseMock();
    ambiguous.tx.reportedEntity.findMany.mockResolvedValue([
      { id: "entity-a", name: "Example Person", handles: [] },
      { id: "entity-b", name: "Other", handles: [{ handle: "example.person" }] },
    ]);

    await expect(
      createReport(
        { id: ACTOR_ID, isSuperAdmin: false },
        createInput,
        ambiguous.client
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(ambiguous.tx.post.create).not.toHaveBeenCalled();

    const collision = createDatabaseMock();
    collision.tx.reportedEntity.findMany.mockResolvedValue([
      {
        id: "entity-b",
        name: "Different Person",
        handles: [{ handle: "example.person" }],
      },
    ]);
    await expect(
      createReport(
        { id: ACTOR_ID, isSuperAdmin: false },
        createInput,
        collision.client
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(collision.tx.post.create).not.toHaveBeenCalled();
  });

  it("lets an Editor update only their own report and records changed fields", async () => {
    const { tx, client } = createDatabaseMock();
    tx.post.findUnique.mockResolvedValue({
      id: POST_ID,
      spaceId: SPACE_ID,
      authorId: ACTOR_ID,
      isAnonymous: true,
    });
    tx.post.update.mockResolvedValue(selectedPost({ isAnonymous: false }));

    await updateReport(
      POST_ID,
      { id: ACTOR_ID, isSuperAdmin: false },
      { description: "Updated body", isAnonymous: false },
      client
    );

    expect(tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: POST_ID },
        data: {
          reportedEntityId: undefined,
          description: "Updated body",
          isAnonymous: false,
          isAdminOnly: undefined,
        },
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "post_update",
          details: {
            changedFields: ["description", "isAnonymous"],
            isAnonymous: false,
          },
        }),
      })
    );

    const denied = createDatabaseMock();
    denied.tx.post.findUnique.mockResolvedValue({
      id: POST_ID,
      spaceId: SPACE_ID,
      authorId: "another-user",
    });
    await expect(
      updateReport(
        POST_ID,
        { id: ACTOR_ID, isSuperAdmin: false },
        { description: "No access" },
        denied.client
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(denied.tx.post.update).not.toHaveBeenCalled();
  });

  it("allows a Moderator to update another author's report", async () => {
    const { tx, client } = createDatabaseMock();
    tx.userSpaceMembership.findUnique.mockResolvedValue({ role: "moderator" });
    tx.post.findUnique.mockResolvedValue({
      id: POST_ID,
      spaceId: SPACE_ID,
      authorId: "another-user",
    });

    await updateReport(
      POST_ID,
      { id: ACTOR_ID, isSuperAdmin: false },
      { isAdminOnly: true, severity: "high", verificationStatus: "pending" },
      client
    );

    expect(tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          severity: "high",
          verificationStatus: "pending",
        }),
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({
            changedFields: ["isAdminOnly", "severity", "verificationStatus"],
          }),
        }),
      })
    );
  });

  it("rejects direct verification of a new high-severity report even for a moderator", async () => {
    const { tx, client } = createDatabaseMock();
    tx.userSpaceMembership.findUnique.mockResolvedValue({ role: "MODERATOR" });
    await expect(createReport({ id: ACTOR_ID, isSuperAdmin: false }, { ...createInput, severity: "high", verificationStatus: "verified" }, client)).rejects.toMatchObject({ status: 409 });
    expect(tx.post.create).not.toHaveBeenCalled();
  });

  it.each([{ requiresSensitiveReview: true, severity: "low" }, { requiresSensitiveReview: false, severity: "high" }])("rejects direct verification of a classified report", async (state) => {
    const { tx, client } = createDatabaseMock();
    tx.user.findUnique.mockResolvedValue({ isSuperAdmin: true });
    tx.post.findUnique.mockResolvedValue({ id: POST_ID, spaceId: SPACE_ID, authorId: ACTOR_ID, ...state });
    await expect(updateReport(POST_ID, { id: ACTOR_ID, isSuperAdmin: true }, { severity: "low", verificationStatus: "verified" }, client)).rejects.toMatchObject({ status: 409 });
    expect(tx.post.update).not.toHaveBeenCalled();
  });

  it("does not attribute an anonymous author's edit in audit logs", async () => {
    const { tx, client } = createDatabaseMock();
    tx.post.findUnique.mockResolvedValue({
      id: POST_ID,
      spaceId: SPACE_ID,
      authorId: ACTOR_ID,
      isAnonymous: true,
    });

    await updateReport(
      POST_ID,
      { id: ACTOR_ID, isSuperAdmin: false },
      { description: "Still anonymous" },
      client
    );

    expect(tx.auditLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({
          action: "post_update",
          actorUserId: null,
          details: expect.objectContaining({ isAnonymous: true }),
        })],
      })
    );
  });

  it("rejects missing posts and cross-space update guards before writing", async () => {
    const missing = createDatabaseMock();
    missing.tx.post.findUnique.mockResolvedValue(null);
    await expect(
      updateReport(
        POST_ID,
        { id: ACTOR_ID, isSuperAdmin: false },
        { description: "Updated" },
        missing.client
      )
    ).rejects.toMatchObject({ status: 404 });

    const moved = createDatabaseMock();
    moved.tx.post.findUnique.mockResolvedValue({
      id: POST_ID,
      spaceId: SPACE_ID,
      authorId: ACTOR_ID,
    });
    await expect(
      updateReport(
        POST_ID,
        { id: ACTOR_ID, isSuperAdmin: false },
        {
          spaceId: "55555555-5555-4555-8555-555555555555",
          description: "Updated",
        },
        moved.client
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(moved.tx.userSpaceMembership.findUnique).toHaveBeenCalledOnce();
    expect(moved.tx.post.update).not.toHaveBeenCalled();
  });

  it("propagates audit failure through the transaction boundary", async () => {
    const { tx, client } = createDatabaseMock();
    tx.reportedEntity.findMany.mockResolvedValue([
      {
        id: ENTITY_ID,
        name: "Example Person",
        handles: [{ handle: "example.person" }],
      },
    ]);
    tx.auditLog.createMany.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      createReport(
        { id: ACTOR_ID, isSuperAdmin: false },
        createInput,
        client
      )
    ).rejects.toThrow("audit unavailable");
    expect(tx.post.create).toHaveBeenCalledOnce();
  });

  it("retries serializable transaction conflicts and returns a conflict after exhaustion", async () => {
    const retryable = createDatabaseMock();
    retryable.transaction
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce(async (operation) => operation(retryable.tx));

    await createReport(
      { id: ACTOR_ID, isSuperAdmin: true },
      createInput,
      retryable.client
    );
    expect(retryable.transaction).toHaveBeenCalledTimes(2);

    const exhausted = createDatabaseMock();
    exhausted.transaction.mockRejectedValue({ code: "P2034" });
    await expect(
      createReport(
        { id: ACTOR_ID, isSuperAdmin: true },
        createInput,
        exhausted.client
      )
    ).rejects.toBeInstanceOf(HttpError);
    await expect(
      createReport(
        { id: ACTOR_ID, isSuperAdmin: true },
        createInput,
        exhausted.client
      )
    ).rejects.toMatchObject({ status: 409 });
  });
});
