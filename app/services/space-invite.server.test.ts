import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";

vi.mock("../lib/invite-token.server", () => ({
  INVITE_TTL_MS: 24 * 60 * 60 * 1000,
  createInviteToken: vi.fn(() => ({
    rawToken: "private-raw-token",
    tokenHash: "stored-token-hash",
  })),
}));
vi.mock("./invite-email.server", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue({ status: "sent" }),
}));

import { sendInviteEmail } from "./invite-email.server";
import { createSpaceInvite } from "./space-invite.server";

const actorId = "00000000-0000-4000-8000-000000000001";
const spaceId = "00000000-0000-4000-8000-000000000002";
const inviteId = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-08-29T10:00:00.000Z");

function createHarness(options: {
  actorRole?: string | null;
  discipline?: "restriction" | "suspension" | null;
  isSuperAdmin?: boolean;
  existingMember?: boolean;
  auditFailure?: boolean;
} = {}) {
  const inviteCreate = vi.fn().mockResolvedValue({ id: inviteId });
  const inviteUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const auditCreate = vi.fn(async () => {
    if (options.auditFailure) throw new Error("audit unavailable");
    return { id: "audit" };
  });
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        isSuperAdmin: options.isSuperAdmin ?? false,
      }),
    },
    disciplinaryAction: {
      findFirst: vi.fn().mockResolvedValue(
        options.discipline ? { kind: options.discipline } : null
      ),
    },
    userSpaceMembership: {
      findUnique: vi.fn().mockResolvedValue(
        options.actorRole === null ? null : { role: options.actorRole ?? "ADMIN" }
      ),
      findFirst: vi.fn().mockResolvedValue(
        options.existingMember ? { userId: "existing-user" } : null
      ),
    },
    space: {
      findUnique: vi.fn().mockResolvedValue({ id: spaceId, name: "Safe Space" }),
    },
    invite: { updateMany: inviteUpdateMany, create: inviteCreate },
    auditLog: { create: auditCreate },
  };
  const transaction = vi.fn(async (callback) => callback(tx));
  return {
    client: { $transaction: transaction } as unknown as PrismaClient,
    transaction,
    inviteCreate,
    inviteUpdateMany,
    auditCreate,
  };
}

describe("space invitation service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores only the token hash, expires old links, audits, then sends the email", async () => {
    const harness = createHarness();
    const result = await createSpaceInvite(
      { id: actorId, firstName: "Ada", lastName: "Admin" },
      spaceId,
      { email: "new@example.test", role: "EDITOR" },
      "https://safe.test",
      harness.client,
      now
    );

    expect(harness.inviteUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { expiresAt: now } })
    );
    expect(harness.inviteCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "new@example.test",
        token: "stored-token-hash",
        roleToAssign: "EDITOR",
        invitedByUserId: actorId,
      }),
      select: { id: true },
    });
    expect(harness.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "user_invite",
        targetEntityId: inviteId,
        spaceId,
      }),
    });
    expect(harness.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteUrl: "https://safe.test/auth/register?token=private-raw-token",
      })
    );
    expect(result).toMatchObject({ id: inviteId, delivery: "sent" });
  });

  it("denies restricted and suspended administrators before writing", async () => {
    for (const discipline of ["restriction", "suspension"] as const) {
      const harness = createHarness({ discipline });
      await expect(
        createSpaceInvite(
          { id: actorId, firstName: "Ada", lastName: "Admin" },
          spaceId,
          { email: "new@example.test", role: "EDITOR" },
          "https://safe.test",
          harness.client,
          now
        )
      ).rejects.toMatchObject({ status: 403 });
      expect(harness.inviteCreate).not.toHaveBeenCalled();
    }
  });

  it("reserves administrator invitations for current super-administrators", async () => {
    const regular = createHarness();
    await expect(
      createSpaceInvite(
        { id: actorId, firstName: "Ada", lastName: "Admin" },
        spaceId,
        { email: "new@example.test", role: "ADMIN" },
        "https://safe.test",
        regular.client,
        now
      )
    ).rejects.toMatchObject({ status: 403 });

    const superAdmin = createHarness({ actorRole: null, isSuperAdmin: true });
    await expect(
      createSpaceInvite(
        { id: actorId, firstName: "Ada", lastName: "Admin" },
        spaceId,
        { email: "new@example.test", role: "ADMIN" },
        "https://safe.test",
        superAdmin.client,
        now
      )
    ).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("does not replace an existing membership or send before a committed audit", async () => {
    const existing = createHarness({ existingMember: true });
    await expect(
      createSpaceInvite(
        { id: actorId, firstName: "Ada", lastName: "Admin" },
        spaceId,
        { email: "new@example.test", role: "EDITOR" },
        "https://safe.test",
        existing.client,
        now
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(existing.inviteCreate).not.toHaveBeenCalled();

    const auditFailure = createHarness({ auditFailure: true });
    await expect(
      createSpaceInvite(
        { id: actorId, firstName: "Ada", lastName: "Admin" },
        spaceId,
        { email: "new@example.test", role: "EDITOR" },
        "https://safe.test",
        auditFailure.client,
        now
      )
    ).rejects.toThrow("audit unavailable");
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });
});
