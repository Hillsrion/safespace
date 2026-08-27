import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";
import {
  changeSpaceMemberRole,
  kickSpaceMember,
  MembershipAdminError,
} from "./space-member-admin.server";

type Role = "ADMIN" | "MODERATOR" | "EDITOR" | "READ_ONLY";

type HarnessOptions = {
  actorExists?: boolean;
  actorIsSuperAdmin?: boolean;
  actorRole?: Role;
  spaceExists?: boolean;
  memberships?: Record<string, Role>;
  auditFailure?: boolean;
  discipline?: "restriction" | "suspension";
};

const spaceId = "00000000-0000-4000-8000-000000000001";
const otherSpaceId = "00000000-0000-4000-8000-000000000002";
const actorId = "00000000-0000-4000-8000-000000000010";
const memberId = "00000000-0000-4000-8000-000000000020";
const otherMemberId = "00000000-0000-4000-8000-000000000030";

function membershipKey(userId: string, memberSpaceId: string) {
  return `${userId}:${memberSpaceId}`;
}

function createHarness(options: HarnessOptions = {}) {
  const memberships = new Map<string, Role>(
    Object.entries({
      [membershipKey(actorId, spaceId)]: options.actorRole ?? "ADMIN",
      [membershipKey(memberId, spaceId)]: "EDITOR",
      ...options.memberships,
    })
  );
  const audits: unknown[] = [];
  const update = vi.fn(async ({ where, data }) => {
    memberships.set(
      membershipKey(where.userId_spaceId.userId, where.userId_spaceId.spaceId),
      data.role
    );
  });
  const remove = vi.fn(async ({ where }) => {
    memberships.delete(
      membershipKey(where.userId_spaceId.userId, where.userId_spaceId.spaceId)
    );
  });
  const auditCreate = vi.fn(async ({ data }) => {
    if (options.auditFailure) throw new Error("audit unavailable");
    audits.push(data);
  });

  const tx = {
    disciplinaryAction: {
      findFirst: vi.fn().mockResolvedValue(options.discipline ? { kind: options.discipline } : null),
    },
    space: {
      findUnique: vi.fn(async ({ where }) =>
        options.spaceExists === false || where.id !== spaceId ? null : { id: spaceId }
      ),
    },
    user: {
      findUnique: vi.fn(async ({ where }) =>
        options.actorExists === false || where.id !== actorId
          ? null
          : { isSuperAdmin: options.actorIsSuperAdmin ?? false }
      ),
    },
    userSpaceMembership: {
      findUnique: vi.fn(async ({ where }) => {
        const compound = where.userId_spaceId;
        const role = memberships.get(membershipKey(compound.userId, compound.spaceId));
        return role ? { role } : null;
      }),
      findMany: vi.fn(async ({ where }) =>
        [...memberships.entries()]
          .filter(([key]) => key.endsWith(`:${where.spaceId}`))
          .map(([, role]) => ({ role }))
      ),
      update,
      delete: remove,
    },
    auditLog: { create: auditCreate },
  };
  const transaction = vi.fn(async (callback) => callback(tx));

  return {
    client: { $transaction: transaction } as unknown as PrismaClient,
    memberships,
    audits,
    update,
    remove,
    auditCreate,
    transaction,
  };
}

describe("space member administration", () => {
  it("does not let a restricted administrator change membership roles", async () => {
    const h = createHarness({ discipline: "restriction" });
    await expect(changeSpaceMemberRole({ id: actorId }, {
      spaceId, userId: memberId, role: "MODERATOR",
    }, h.client)).rejects.toMatchObject({ status: 403 });
    expect(h.update).not.toHaveBeenCalled();
  });

  it("changes an ordinary member role and writes its audit record in a serializable transaction", async () => {
    const h = createHarness();

    await expect(
      changeSpaceMemberRole({ id: actorId }, { spaceId, userId: memberId, role: "MODERATOR" }, h.client)
    ).resolves.toEqual({ spaceId, userId: memberId, role: "MODERATOR" });

    expect(h.memberships.get(membershipKey(memberId, spaceId))).toBe("MODERATOR");
    expect(h.audits).toEqual([
      expect.objectContaining({
        action: "user_role_change",
        actorUserId: actorId,
        targetEntityId: memberId,
        spaceId,
        details: { previousRole: "EDITOR", role: "MODERATOR" },
      }),
    ]);
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("allows a super-admin to manage an administrator but rejects that operation for a regular space admin", async () => {
    const memberships = {
      [membershipKey(memberId, spaceId)]: "ADMIN" as Role,
      [membershipKey(otherMemberId, spaceId)]: "EDITOR" as Role,
    };
    const regularAdmin = createHarness({ memberships });
    await expect(
      changeSpaceMemberRole({ id: actorId }, { spaceId, userId: memberId, role: "EDITOR" }, regularAdmin.client)
    ).rejects.toMatchObject<Partial<MembershipAdminError>>({ status: 403 });
    expect(regularAdmin.update).not.toHaveBeenCalled();

    const superAdmin = createHarness({ actorIsSuperAdmin: true, memberships });
    await expect(
      changeSpaceMemberRole({ id: actorId }, { spaceId, userId: memberId, role: "EDITOR" }, superAdmin.client)
    ).resolves.toBeDefined();
  });

  it("prevents changing or kicking the final administrator", async () => {
    const membership = { [membershipKey(memberId, spaceId)]: "ADMIN" as Role };
    const change = createHarness({
      actorIsSuperAdmin: true,
      actorRole: "EDITOR",
      memberships: membership,
    });
    await expect(
      changeSpaceMemberRole({ id: actorId }, { spaceId, userId: memberId, role: "EDITOR" }, change.client)
    ).rejects.toMatchObject<Partial<MembershipAdminError>>({ status: 409 });
    expect(change.update).not.toHaveBeenCalled();

    const kick = createHarness({
      actorIsSuperAdmin: true,
      actorRole: "EDITOR",
      memberships: membership,
    });
    await expect(
      kickSpaceMember({ id: actorId }, { spaceId, userId: memberId }, kick.client)
    ).rejects.toMatchObject<Partial<MembershipAdminError>>({ status: 409 });
    expect(kick.remove).not.toHaveBeenCalled();
  });

  it("never treats a membership in another space as a target in this space", async () => {
    const h = createHarness({
      memberships: { [membershipKey(memberId, otherSpaceId)]: "EDITOR" },
    });
    h.memberships.delete(membershipKey(memberId, spaceId));

    await expect(
      kickSpaceMember({ id: actorId }, { spaceId, userId: memberId }, h.client)
    ).rejects.toMatchObject<Partial<MembershipAdminError>>({ status: 404 });
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("rechecks actor rights inside the write transaction", async () => {
    const h = createHarness({ actorRole: "EDITOR" });

    await expect(
      kickSpaceMember({ id: actorId }, { spaceId, userId: memberId }, h.client)
    ).rejects.toMatchObject<Partial<MembershipAdminError>>({ status: 403 });
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it("does not finish the mutation when audit creation fails", async () => {
    const h = createHarness({ auditFailure: true });

    await expect(
      kickSpaceMember({ id: actorId }, { spaceId, userId: memberId }, h.client)
    ).rejects.toThrow("audit unavailable");
    expect(h.remove).toHaveBeenCalledOnce();
    // In production Prisma rolls the delete back because both calls are in the
    // same interactive transaction; this harness only verifies the callback.
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });
});
