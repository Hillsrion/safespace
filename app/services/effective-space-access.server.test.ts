import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";
import { getEffectiveSpaceAccess } from "./effective-space-access.server";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "22222222-2222-4222-8222-222222222222";

function client(options: {
  superAdmin?: boolean;
  role?: string | null;
  discipline?: "restriction" | "suspension" | null;
}) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        isSuperAdmin: options.superAdmin ?? false,
      }),
    },
    userSpaceMembership: {
      findUnique: vi.fn().mockResolvedValue(
        options.role === null ? null : { role: options.role ?? "EDITOR" }
      ),
    },
    disciplinaryAction: {
      findFirst: vi.fn().mockResolvedValue(
        options.discipline ? { kind: options.discipline } : null
      ),
    },
  } as unknown as Parameters<
    Parameters<PrismaClient["$transaction"]>[0]
  >[0];
}

describe("effective space access", () => {
  it("preserves an ordinary active membership", async () => {
    await expect(
      getEffectiveSpaceAccess(client({ role: "Moderator" }), USER_ID, SPACE_ID)
    ).resolves.toEqual({
      isSuperAdmin: false,
      role: "MODERATOR",
      discipline: null,
    });
  });

  it("downgrades a restricted member to read-only", async () => {
    await expect(
      getEffectiveSpaceAccess(
        client({ role: "ADMIN", discipline: "restriction" }),
        USER_ID,
        SPACE_ID
      )
    ).resolves.toEqual({
      isSuperAdmin: false,
      role: "READ_ONLY",
      discipline: "restriction",
    });
  });

  it("removes all space access during a suspension", async () => {
    await expect(
      getEffectiveSpaceAccess(
        client({ role: "EDITOR", discipline: "suspension" }),
        USER_ID,
        SPACE_ID
      )
    ).resolves.toEqual({
      isSuperAdmin: false,
      role: null,
      discipline: "suspension",
    });
  });

  it("keeps global break-glass access independent of space discipline", async () => {
    const tx = client({ superAdmin: true, discipline: "suspension" });
    await expect(
      getEffectiveSpaceAccess(tx, USER_ID, SPACE_ID)
    ).resolves.toEqual({
      isSuperAdmin: true,
      role: null,
      discipline: null,
    });
    expect(tx.disciplinaryAction.findFirst).not.toHaveBeenCalled();
  });
});
