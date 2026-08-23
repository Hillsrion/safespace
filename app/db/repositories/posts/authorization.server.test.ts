import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";
import { deletePost, updatePostStatus } from "./queries.server";

function transactionClient(options?: {
  post?: Record<string, unknown> | null;
  actor?: { isSuperAdmin: boolean; memberships: Array<{ role: string }> } | null;
  updated?: Record<string, unknown>;
  auditError?: Error;
}) {
  const tx = {
    post: {
      findUnique: vi.fn().mockResolvedValue(
        options?.post ?? {
          id: "post-1",
          spaceId: "space-1",
          authorId: "author-1",
          isAnonymous: false,
          isAdminOnly: false,
          status: "active",
        }
      ),
      delete: vi.fn().mockResolvedValue({ id: "post-1" }),
      update: vi.fn().mockResolvedValue(
        options?.updated ?? { id: "post-1", status: "hidden" }
      ),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(
        options?.actor ?? {
          isSuperAdmin: false,
          memberships: [{ role: "MODERATOR" }],
        }
      ),
    },
    auditLog: {
      create: options?.auditError
        ? vi.fn().mockRejectedValue(options.auditError)
        : vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
  };
  const transaction = vi.fn(
    async (callback: (transaction: typeof tx) => unknown) => callback(tx)
  );
  const client = { $transaction: transaction } as unknown as PrismaClient;

  return { client, transaction, tx };
}

describe("post mutation authorization", () => {
  it("rejects a former author after their space membership is removed", async () => {
    const { client, tx } = transactionClient({
      actor: { isSuperAdmin: false, memberships: [] },
    });

    await expect(deletePost("post-1", "author-1", client)).rejects.toMatchObject({
      status: 403,
    });
    expect(tx.post.delete).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a read-only author after a role downgrade", async () => {
    const { client, tx } = transactionClient({
      actor: {
        isSuperAdmin: false,
        memberships: [{ role: "Read-only" }],
      },
    });

    await expect(deletePost("post-1", "author-1", client)).rejects.toMatchObject({
      status: 403,
    });
    expect(tx.post.delete).not.toHaveBeenCalled();
  });

  it("reserves deletion to moderators and admins, even for a current author", async () => {
    const { client, tx } = transactionClient({
      actor: {
        isSuperAdmin: false,
        memberships: [{ role: "EDITOR" }],
      },
    });

    await expect(deletePost("post-1", "author-1", client)).rejects.toMatchObject({
      status: 403,
    });
    expect(tx.post.delete).not.toHaveBeenCalled();
  });

  it("deletes and records post_delete through the same serializable transaction", async () => {
    const { client, transaction, tx } = transactionClient({
      actor: {
        isSuperAdmin: false,
        memberships: [{ role: "Moderator" }],
      },
    });

    await deletePost("post-1", "moderator-1", client);

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(tx.post.delete).toHaveBeenCalledWith({ where: { id: "post-1" } });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "moderator-1",
        action: "post_delete",
        targetEntityId: "post-1",
        spaceId: "space-1",
      }),
    });
  });

  it("fails the deletion transaction when its audit record cannot be written", async () => {
    const auditError = new Error("audit unavailable");
    const { client, tx } = transactionClient({ auditError });

    await expect(deletePost("post-1", "author-1", client)).rejects.toBe(
      auditError
    );
    expect(tx.post.delete).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it("revalidates the moderator role before changing visibility", async () => {
    const { client, tx } = transactionClient({
      actor: { isSuperAdmin: false, memberships: [] },
    });

    await expect(
      updatePostStatus("post-1", "hidden", "former-moderator", client)
    ).rejects.toMatchObject({ status: 404 });
    expect(tx.post.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("atomically audits hide/unhide as post_update", async () => {
    const { client, transaction, tx } = transactionClient({
      actor: {
        isSuperAdmin: false,
        memberships: [{ role: "ADMIN" }],
      },
    });

    await updatePostStatus("post-1", "hidden", "admin-1", client);

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: "post-1" },
      data: { status: "hidden" },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin-1",
        action: "post_update",
        details: {
          changedFields: ["status"],
          previousStatus: "active",
          status: "hidden",
        },
      }),
    });
  });
});
