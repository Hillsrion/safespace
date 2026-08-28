import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";
import {
  createPostFlag,
  decideModerationFlag,
  listModerationFlags,
} from "./flags.server";

type Role = "READ_ONLY" | "EDITOR" | "MODERATOR" | "ADMIN";

const spaceId = "00000000-0000-4000-8000-000000000001";
const otherSpaceId = "00000000-0000-4000-8000-000000000002";
const postId = "00000000-0000-4000-8000-000000000010";
const flagId = "00000000-0000-4000-8000-000000000020";
const actorId = "00000000-0000-4000-8000-000000000030";
const createdAt = new Date("2026-08-23T12:00:00.000Z");

type HarnessOptions = {
  actorExists?: boolean;
  isSuperAdmin?: boolean;
  role?: Role;
  membershipSpaceId?: string;
  postStatus?: "active" | "hidden";
  isAdminOnly?: boolean;
  postSpaceId?: string;
  pendingExists?: boolean;
  flagStatus?: "pending_review" | "resolved" | "rejected";
  flagSpaceId?: string;
  auditFailure?: boolean;
  discipline?: "restriction" | "suspension";
};

function createHarness(options: HarnessOptions = {}) {
  const createdFlag = {
    id: flagId,
    postId,
    reason: "Needs review",
    status: "pending_review" as const,
    createdAt,
    resolvedAt: null,
  };
  const postFlagCreate = vi.fn(async () => createdFlag);
  const postFlagUpdate = vi.fn(async ({ data }) => ({
    ...createdFlag,
    status: data.status,
    resolvedAt: data.resolvedAt,
  }));
  const auditCreate = vi.fn(async () => {
    if (options.auditFailure) throw new Error("audit unavailable");
    return { id: "audit-1" };
  });
  const queueFlag = {
    ...createdFlag,
    post: {
      id: postId,
      description: "Anonymous report",
      isAnonymous: true,
      isAdminOnly: true,
      status: "active" as const,
      createdAt,
      // Deliberately present in the fake row: the response mapper must drop it.
      authorId: "secret-author",
      author: { id: "secret-author", firstName: "Secret" },
      reportedEntity: {
        id: "entity-1",
        name: "Entity",
        handles: [{ handle: "entity", platform: "Instagram" }],
      },
    },
  };

  const tx = {
    disciplinaryAction: {
      findFirst: vi.fn().mockResolvedValue(options.discipline ? { kind: options.discipline } : null),
    },
    user: {
      findUnique: vi.fn(async () =>
        options.actorExists === false
          ? null
          : { isSuperAdmin: options.isSuperAdmin ?? false }
      ),
    },
    userSpaceMembership: {
      findUnique: vi.fn(async ({ where }) => {
        const expectedSpace = options.membershipSpaceId ?? spaceId;
        return where.userId_spaceId.spaceId === expectedSpace && options.role
          ? { role: options.role }
          : null;
      }),
    },
    post: {
      findFirst: vi.fn(async ({ where }) =>
        where.id === postId &&
        where.spaceId === (options.postSpaceId ?? spaceId)
          ? {
              id: postId,
              status: options.postStatus ?? "active",
              isAdminOnly: options.isAdminOnly ?? false,
            }
          : null
      ),
    },
    postFlag: {
      findFirst: vi.fn(async ({ where }) => {
        if (where.flaggerUserId) {
          return options.pendingExists ? { id: flagId } : null;
        }
        return where.id === flagId &&
          where.post?.spaceId === (options.flagSpaceId ?? spaceId)
          ? {
              ...createdFlag,
              status: options.flagStatus ?? "pending_review",
            }
          : null;
      }),
      create: postFlagCreate,
      update: postFlagUpdate,
      findMany: vi.fn(async () => [queueFlag]),
    },
    auditLog: { create: auditCreate },
  };
  const transaction = vi.fn(async (callback) => callback(tx));
  const client = {
    ...tx,
    $transaction: transaction,
  } as unknown as PrismaClient;

  return {
    client,
    tx,
    transaction,
    postFlagCreate,
    postFlagUpdate,
    auditCreate,
  };
}

describe("post flag writes", () => {
  it("rejects a cursor belonging to another space before querying its queue", async () => {
    const h = createHarness({ role: "MODERATOR", flagSpaceId: otherSpaceId });
    await expect(listModerationFlags({ id: actorId }, { spaceId, cursor: flagId, status: "pending_review", limit: 20 }, h.client)).rejects.toMatchObject({ status: 404 });
    expect(h.tx.postFlag.findMany).not.toHaveBeenCalled();
  });
  it("does not let a restricted moderator decide flags", async () => {
    const h = createHarness({ role: "MODERATOR", discipline: "restriction" });
    await expect(decideModerationFlag({ id: actorId }, {
      spaceId, flagId, status: "resolved",
    }, h.client)).rejects.toMatchObject({ status: 403 });
    expect(h.postFlagUpdate).not.toHaveBeenCalled();
  });

  it("lets an active read-only member flag a visible post and audits atomically", async () => {
    const h = createHarness({ role: "READ_ONLY" });

    await expect(
      createPostFlag(
        { id: actorId },
        { spaceId, postId, reason: "Needs review" },
        h.client
      )
    ).resolves.toEqual({
      id: flagId,
      postId,
      reason: "Needs review",
      status: "pending_review",
      createdAt: createdAt.toISOString(),
      resolvedAt: null,
    });

    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(h.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: actorId,
        action: "post_flag",
        targetEntityId: flagId,
        spaceId,
        details: { postId },
      }),
    });
  });

  it("hides cross-space, hidden, and admin-only posts from ineligible flaggers", async () => {
    const noMembership = createHarness();
    await expect(
      createPostFlag({ id: actorId }, { spaceId, postId }, noMembership.client)
    ).rejects.toMatchObject({ status: 404 });

    const hidden = createHarness({ role: "EDITOR", postStatus: "hidden" });
    await expect(
      createPostFlag({ id: actorId }, { spaceId, postId }, hidden.client)
    ).rejects.toMatchObject({ status: 404 });

    const adminOnly = createHarness({ role: "EDITOR", isAdminOnly: true });
    await expect(
      createPostFlag({ id: actorId }, { spaceId, postId }, adminOnly.client)
    ).rejects.toMatchObject({ status: 404 });

    expect(noMembership.postFlagCreate).not.toHaveBeenCalled();
    expect(hidden.postFlagCreate).not.toHaveBeenCalled();
    expect(adminOnly.postFlagCreate).not.toHaveBeenCalled();
  });

  it("allows a moderator to flag an admin-only post", async () => {
    const h = createHarness({ role: "MODERATOR", isAdminOnly: true });

    await expect(
      createPostFlag({ id: actorId }, { spaceId, postId }, h.client)
    ).resolves.toMatchObject({ id: flagId });
  });

  it("rejects a second pending flag for the same user and post", async () => {
    const h = createHarness({ role: "EDITOR", pendingExists: true });

    await expect(
      createPostFlag({ id: actorId }, { spaceId, postId }, h.client)
    ).rejects.toMatchObject({ status: 409 });
    expect(h.postFlagCreate).not.toHaveBeenCalled();
  });

  it("translates the database uniqueness race into a duplicate conflict", async () => {
    const client = {
      $transaction: vi.fn().mockRejectedValue({ code: "P2002" }),
    } as unknown as PrismaClient;

    await expect(
      createPostFlag({ id: actorId }, { spaceId, postId }, client)
    ).rejects.toMatchObject({ status: 409 });
  });

  it("fails the flagging transaction when audit creation fails", async () => {
    const h = createHarness({ role: "EDITOR", auditFailure: true });

    await expect(
      createPostFlag({ id: actorId }, { spaceId, postId }, h.client)
    ).rejects.toThrow("audit unavailable");
    expect(h.postFlagCreate).toHaveBeenCalledOnce();
    expect(h.auditCreate).toHaveBeenCalledOnce();
  });
});

describe("moderation queue", () => {
  it("requires a current Moderator/Admin role and keeps the query space-scoped", async () => {
    const editor = createHarness({ role: "EDITOR" });
    await expect(
      listModerationFlags(
        { id: actorId },
        { spaceId, status: "pending_review", limit: 20 },
        editor.client
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(editor.tx.postFlag.findMany).not.toHaveBeenCalled();

    const moderator = createHarness({ role: "MODERATOR" });
    await listModerationFlags(
      { id: actorId },
      { spaceId, status: "pending_review", limit: 20 },
      moderator.client
    );
    expect(moderator.tx.postFlag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "pending_review",
          post: expect.objectContaining({ spaceId }),
        }),
      })
    );
  });

  it("returns a minimal queue payload with no post author or flagger identity", async () => {
    const h = createHarness({ role: "ADMIN" });

    const result = await listModerationFlags(
      { id: actorId },
      { spaceId, status: "pending_review", limit: 20 },
      h.client
    );

    expect(result.flags[0]).not.toHaveProperty("flaggerUserId");
    expect(result.flags[0]).not.toHaveProperty("resolvedByUserId");
    expect(result.flags[0].post).not.toHaveProperty("authorId");
    expect(result.flags[0].post).not.toHaveProperty("author");
  });

  it("does not expose a queue in another space", async () => {
    const h = createHarness({
      role: "MODERATOR",
      membershipSpaceId: otherSpaceId,
    });

    await expect(
      listModerationFlags(
        { id: actorId },
        { spaceId, status: "pending_review", limit: 20 },
        h.client
      )
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("moderation decisions", () => {
  it("rechecks the role inside the decision transaction", async () => {
    const h = createHarness({ role: "EDITOR" });

    await expect(
      decideModerationFlag(
        { id: actorId },
        { spaceId, flagId, status: "rejected" },
        h.client
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(h.postFlagUpdate).not.toHaveBeenCalled();
  });

  it("resolves a pending flag and writes flag_resolve in the same transaction", async () => {
    const h = createHarness({ role: "MODERATOR" });

    await expect(
      decideModerationFlag(
        { id: actorId },
        { spaceId, flagId, status: "resolved" },
        h.client
      )
    ).resolves.toMatchObject({ id: flagId, status: "resolved" });

    expect(h.postFlagUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: flagId },
        data: expect.objectContaining({
          status: "resolved",
          resolvedByUserId: actorId,
        }),
      })
    );
    expect(h.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "flag_resolve",
        targetEntityId: flagId,
        spaceId,
        details: {
          postId,
          previousStatus: "pending_review",
          status: "resolved",
        },
      }),
    });
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("rejects cross-space and already-decided flags", async () => {
    const crossSpace = createHarness({
      role: "MODERATOR",
      flagSpaceId: otherSpaceId,
    });
    await expect(
      decideModerationFlag(
        { id: actorId },
        { spaceId, flagId, status: "rejected" },
        crossSpace.client
      )
    ).rejects.toMatchObject({ status: 404 });

    const decided = createHarness({
      role: "ADMIN",
      flagStatus: "resolved",
    });
    await expect(
      decideModerationFlag(
        { id: actorId },
        { spaceId, flagId, status: "rejected" },
        decided.client
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it("allows a current super admin and rolls back semantically on audit failure", async () => {
    const h = createHarness({ isSuperAdmin: true, auditFailure: true });

    await expect(
      decideModerationFlag(
        { id: actorId },
        { spaceId, flagId, status: "rejected" },
        h.client
      )
    ).rejects.toThrow("audit unavailable");
    expect(h.postFlagUpdate).toHaveBeenCalledOnce();
    expect(h.auditCreate).toHaveBeenCalledOnce();
  });
});
