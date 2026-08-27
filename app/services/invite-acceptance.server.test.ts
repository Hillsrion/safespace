import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptInvitationForExistingUser, InvalidInviteError } from "./invite-acceptance.server";
import { getDbContext } from "../db/context.server";
import type { PrismaClient } from "../generated/prisma";

describe("existing-account invitation acceptance", () => {
  const user = { id: "member", email: "member@example.test" };
  const tx = {
    user: { findUnique: vi.fn() },
    invite: { findFirst: vi.fn(), updateMany: vi.fn() },
    userSpaceMembership: { findUnique: vi.fn(), create: vi.fn() },
  };
  const transaction = vi.fn(async (operation: (client: typeof tx) => unknown) => {
    expect(getDbContext()).toMatchObject({ mode: "registration", email: user.email });
    return operation(tx);
  });
  const client = { $transaction: transaction } as unknown as PrismaClient;
  beforeEach(() => {
    vi.clearAllMocks();
    tx.user.findUnique.mockResolvedValue(user);
    tx.invite.findFirst.mockResolvedValue({ id: "invite", email: user.email, roleToAssign: "EDITOR", spaceId: "invited-space", isUsed: false, expiresAt: new Date(Date.now() + 60_000) });
    tx.invite.updateMany.mockResolvedValue({ count: 1 });
    tx.userSpaceMembership.findUnique.mockResolvedValue(null);
  });
  const accept = () => acceptInvitationForExistingUser(user, "private-invitation-token", client);

  it("atomically claims the invite and adds only its assigned membership without creating a user", async () => {
    expect(await accept()).toEqual({ spaceId: "invited-space" });
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.invite.updateMany).toHaveBeenCalledWith({ where: { id: "invite", isUsed: false, expiresAt: { gt: expect.any(Date) } }, data: { isUsed: true } });
    expect(tx.userSpaceMembership.create).toHaveBeenCalledWith({ data: { userId: user.id, spaceId: "invited-space", role: "EDITOR" } });
  });
  it.each([
    { email: "someone-else@example.test" }, { isUsed: true },
    { expiresAt: new Date(0) }, { roleToAssign: "SUPERADMIN" },
  ])("rejects invitation mismatch/expiry/invalid role: %j", async (change) => {
    tx.invite.findFirst.mockResolvedValue({ ...await tx.invite.findFirst(), ...change });
    await expect(accept()).rejects.toBeInstanceOf(InvalidInviteError);
    expect(tx.invite.updateMany).not.toHaveBeenCalled();
    expect(tx.userSpaceMembership.create).not.toHaveBeenCalled();
  });
  it("rejects a changed email or deleted account before claiming", async () => {
    tx.user.findUnique.mockResolvedValue({ ...user, email: "changed@example.test" });
    await expect(accept()).rejects.toBeInstanceOf(InvalidInviteError);
    tx.user.findUnique.mockResolvedValue(null);
    await expect(accept()).rejects.toBeInstanceOf(InvalidInviteError);
    expect(tx.invite.updateMany).not.toHaveBeenCalled();
  });
  it("does not accept a token already claimed by a concurrent request", async () => {
    tx.invite.updateMany.mockResolvedValue({ count: 0 });
    await expect(accept()).rejects.toBeInstanceOf(InvalidInviteError);
    expect(tx.userSpaceMembership.create).not.toHaveBeenCalled();
  });
  it("never overwrites an existing role; throws within the transaction so its claim rolls back", async () => {
    tx.userSpaceMembership.findUnique.mockResolvedValue({ id: "existing-membership" });
    await expect(accept()).rejects.toBeInstanceOf(InvalidInviteError);
    expect(tx.userSpaceMembership.create).not.toHaveBeenCalled();
  });
});
