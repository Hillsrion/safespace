import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma";
import { hashPassword } from "../lib/password";
import {
  AccountProfileError,
  updateOwnAccount,
} from "./account-profile.server";

const userId = "00000000-0000-4000-8000-000000000010";

async function createHarness(email = "before@example.test") {
  const password = await hashPassword("Correct-password-1!");
  const tx = {
    user: {
      findUnique: vi.fn(async () => ({
        email,
        firstName: "Before",
        lastName: "Person",
        instagram: null,
        password,
      })),
      update: vi.fn(async () => ({ id: userId })),
    },
    auditLog: { create: vi.fn(async () => ({ id: "audit-id" })) },
  };
  const transaction = vi.fn(async (callback) => callback(tx));
  return {
    tx,
    transaction,
    client: { $transaction: transaction } as unknown as PrismaClient,
  };
}

const baseInput = {
  email: "before@example.test",
  firstName: "Ada",
  lastName: "Lovelace",
  instagram: "@ada",
};

describe("account profile service", () => {
  it("updates ordinary profile fields without requiring the current password", async () => {
    const h = await createHarness();

    await updateOwnAccount(userId, baseInput, h.client);

    expect(h.tx.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: {
        email: baseInput.email,
        firstName: "Ada",
        lastName: "Lovelace",
        instagram: "@ada",
      },
    });
    expect(h.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "account_update",
        actorUserId: userId,
        details: { changedFields: ["firstName", "lastName", "instagram"] },
      }),
    });
  });

  it("rejects an email change without valid reauthentication", async () => {
    const h = await createHarness();

    await expect(
      updateOwnAccount(
        userId,
        { ...baseInput, email: "after@example.test" },
        h.client
      )
    ).rejects.toMatchObject<Partial<AccountProfileError>>({
      status: 400,
      field: "currentPassword",
    });
    expect(h.tx.user.update).not.toHaveBeenCalled();
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("reauthenticates and atomically audits email and password changes", async () => {
    const h = await createHarness();

    await updateOwnAccount(
      userId,
      {
        ...baseInput,
        email: " AFTER@EXAMPLE.TEST ",
        currentPassword: "Correct-password-1!",
        newPassword: "Another-password-2!",
      },
      h.client
    );

    expect(h.tx.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: expect.objectContaining({
        email: "after@example.test",
        password: expect.any(String),
      }),
    });
    expect(h.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        details: {
          changedFields: ["firstName", "lastName", "instagram", "email", "password"],
        },
      }),
    });
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("maps unique email conflicts without disclosing the existing account", async () => {
    const h = await createHarness();
    h.tx.user.update.mockRejectedValueOnce({ code: "P2002" });

    await expect(
      updateOwnAccount(
        userId,
        {
          ...baseInput,
          email: "after@example.test",
          currentPassword: "Correct-password-1!",
        },
        h.client
      )
    ).rejects.toMatchObject<Partial<AccountProfileError>>({ status: 409 });
  });
});
