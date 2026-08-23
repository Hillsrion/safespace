import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";
import { hashPassword } from "../lib/password";
import {
  deleteAccount,
  leaveSpace,
  MemberLifecycleError,
} from "./member-lifecycle.server";

type Role = "ADMIN" | "EDITOR" | "MODERATOR" | "READ_ONLY";

const actorId = "00000000-0000-4000-8000-000000000010";
const spaceId = "00000000-0000-4000-8000-000000000001";
const otherSpaceId = "00000000-0000-4000-8000-000000000002";

type HarnessOptions = {
  password?: string;
  memberships?: Array<{ spaceId: string; role: Role }>;
  createdSpace?: boolean;
  isSuperAdmin?: boolean;
  superAdminCount?: number;
};

async function createHarness(options: HarnessOptions = {}) {
  const password = await hashPassword(options.password ?? "Correct-password-1!");
  const memberships = options.memberships ?? [{ spaceId, role: "EDITOR" as Role }];
  const calls = {
    postDelete: vi.fn(async () => ({ count: 0 })),
    postUpdate: vi.fn(async () => ({ count: 0 })),
    mediaDelete: vi.fn(async () => ({ count: 0 })),
    flagDelete: vi.fn(async () => ({ count: 0 })),
    flagUpdate: vi.fn(async () => ({ count: 0 })),
    inviteDelete: vi.fn(async () => ({ count: 0 })),
    membershipDelete: vi.fn(async () => ({})),
    membershipsDelete: vi.fn(async () => ({ count: 0 })),
    auditCreate: vi.fn(async () => ({})),
    auditUpdate: vi.fn(async () => ({ count: 0 })),
    userDelete: vi.fn(async () => ({})),
    userCount: vi.fn(async () => options.superAdminCount ?? 2),
  };
  const tx = {
    user: {
      findUnique: vi.fn(async ({ where }) =>
        where.id === actorId
          ? { id: actorId, password, isSuperAdmin: options.isSuperAdmin ?? false }
          : null
      ),
      count: calls.userCount,
      delete: calls.userDelete,
    },
    userSpaceMembership: {
      findUnique: vi.fn(async ({ where }) => {
        const compound = where.userId_spaceId;
        if (compound.userId !== actorId) return null;
        const membership = memberships.find((item) => item.spaceId === compound.spaceId);
        return membership ? { role: membership.role } : null;
      }),
      findMany: vi.fn(async ({ where }) => {
        if (where.userId === actorId) return memberships;
        return memberships
          .filter((item) => item.spaceId === where.spaceId)
          .map((item) => ({ userId: actorId, role: item.role }));
      }),
      delete: calls.membershipDelete,
      deleteMany: calls.membershipsDelete,
    },
    post: { deleteMany: calls.postDelete, updateMany: calls.postUpdate },
    media: { deleteMany: calls.mediaDelete },
    postFlag: { deleteMany: calls.flagDelete, updateMany: calls.flagUpdate },
    invite: { deleteMany: calls.inviteDelete },
    space: {
      findFirst: vi.fn(async () => (options.createdSpace ? { id: spaceId } : null)),
    },
    auditLog: { create: calls.auditCreate, updateMany: calls.auditUpdate },
  };
  const transaction = vi.fn(async (callback) => callback(tx));
  return { client: { $transaction: transaction } as unknown as PrismaClient, calls, transaction };
}

describe("member lifecycle workflows", () => {
  it("anonymizes space posts, removes media, then leaves with an attributable audit", async () => {
    const h = await createHarness();

    await expect(
      leaveSpace({ id: actorId }, { spaceId, contributionPolicy: "anonymize" }, h.client)
    ).resolves.toEqual({ spaceId, contributionPolicy: "anonymize" });

    expect(h.calls.postUpdate).toHaveBeenCalledWith({
      where: { authorId: actorId, spaceId },
      data: { authorId: null, isAnonymous: true },
    });
    expect(h.calls.mediaDelete).toHaveBeenCalledWith({
      where: { uploaderId: actorId, post: { spaceId } },
    });
    expect(h.calls.membershipDelete).toHaveBeenCalledWith({
      where: { userId_spaceId: { userId: actorId, spaceId } },
    });
    expect(h.calls.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "user_leave", actorUserId: actorId, spaceId }),
    });
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("rejects leaving the final administrator before contributions are changed", async () => {
    const h = await createHarness({ memberships: [{ spaceId, role: "ADMIN" }] });

    await expect(
      leaveSpace({ id: actorId }, { spaceId, contributionPolicy: "delete" }, h.client)
    ).rejects.toMatchObject<Partial<MemberLifecycleError>>({ status: 409 });
    expect(h.calls.postDelete).not.toHaveBeenCalled();
    expect(h.calls.membershipDelete).not.toHaveBeenCalled();
  });

  it("does not allow a membership from another space to satisfy leave", async () => {
    const h = await createHarness({ memberships: [{ spaceId: otherSpaceId, role: "EDITOR" }] });

    await expect(
      leaveSpace({ id: actorId }, { spaceId, contributionPolicy: "delete" }, h.client)
    ).rejects.toMatchObject<Partial<MemberLifecycleError>>({ status: 404 });
    expect(h.calls.membershipDelete).not.toHaveBeenCalled();
  });

  it("requires the current password before deleting an account", async () => {
    const h = await createHarness();

    await expect(
      deleteAccount({ id: actorId }, { password: "not-the-password", contributionPolicy: "delete" }, h.client)
    ).rejects.toMatchObject<Partial<MemberLifecycleError>>({ status: 403 });
    expect(h.calls.userDelete).not.toHaveBeenCalled();
  });

  it("blocks account deletion until immutable space ownership is transferred", async () => {
    const h = await createHarness({ createdSpace: true });

    await expect(
      deleteAccount({ id: actorId }, { password: "Correct-password-1!", contributionPolicy: "delete" }, h.client)
    ).rejects.toMatchObject<Partial<MemberLifecycleError>>({ status: 409 });
    expect(h.calls.userDelete).not.toHaveBeenCalled();
  });

  it("does not allow the last super-administrator to delete their account", async () => {
    const h = await createHarness({ isSuperAdmin: true, superAdminCount: 1 });

    await expect(
      deleteAccount(
        { id: actorId },
        { password: "Correct-password-1!", contributionPolicy: "delete" },
        h.client
      )
    ).rejects.toMatchObject<Partial<MemberLifecycleError>>({ status: 409 });
    expect(h.calls.userDelete).not.toHaveBeenCalled();
  });

  it("deletes FK-dependent data and anonymizes the retained account audit", async () => {
    const h = await createHarness();

    await expect(
      deleteAccount({ id: actorId }, { password: "Correct-password-1!", contributionPolicy: "anonymize" }, h.client)
    ).resolves.toEqual({ deletedUserId: actorId, contributionPolicy: "anonymize" });

    expect(h.calls.postUpdate).toHaveBeenCalledWith({
      where: { authorId: actorId },
      data: { authorId: null, isAnonymous: true },
    });
    expect(h.calls.mediaDelete).toHaveBeenCalledWith({ where: { uploaderId: actorId } });
    expect(h.calls.flagUpdate).toHaveBeenCalledWith({
      where: { resolvedByUserId: actorId },
      data: { resolvedByUserId: null },
    });
    expect(h.calls.inviteDelete).toHaveBeenCalledWith({ where: { invitedByUserId: actorId } });
    expect(h.calls.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "account_delete", actorUserId: actorId }),
    });
    expect(h.calls.auditUpdate).toHaveBeenCalledWith({
      where: { actorUserId: actorId },
      data: { actorUserId: null },
    });
    expect(h.calls.userDelete).toHaveBeenCalledWith({ where: { id: actorId } });
  });
});
