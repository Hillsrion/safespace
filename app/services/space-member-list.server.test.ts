import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";

import { listSpaceMembers } from "./space-member-list.server";

const actorId = "00000000-0000-4000-8000-000000000001";
const spaceId = "00000000-0000-4000-8000-000000000002";
const memberId = "00000000-0000-4000-8000-000000000003";

function createHarness(options: {
  actorRole?: string | null;
  discipline?: "restriction" | "suspension" | null;
  isSuperAdmin?: boolean;
  spaceExists?: boolean;
} = {}) {
  const findMany = vi.fn().mockResolvedValue([
    {
      role: "Editor",
      joinedAt: new Date("2026-01-02T03:04:05.000Z"),
      activity: { lastActiveDay: new Date("2026-08-28T00:00:00.000Z") },
      user: {
        id: memberId,
        email: "member@example.test",
        firstName: "Sam",
        lastName: "Doe",
      },
    },
  ]);
  const count = vi.fn().mockResolvedValue(1);
  const tx = {
    space: {
      findUnique: vi.fn().mockResolvedValue(
        options.spaceExists === false ? null : { id: spaceId }
      ),
    },
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
      findMany,
      count,
    },
  };
  const transaction = vi.fn(async (callback) => callback(tx));
  return {
    client: { $transaction: transaction } as unknown as PrismaClient,
    findMany,
    count,
    transaction,
  };
}

describe("space member list service", () => {
  it("lists only scoped safe member fields for a current administrator", async () => {
    const harness = createHarness();
    const result = await listSpaceMembers(
      { id: actorId },
      spaceId,
      { page: 2, limit: 10, q: "Sam", role: "EDITOR" },
      harness.client
    );

    expect(result).toEqual({
      users: [
        {
          id: memberId,
          email: "member@example.test",
          firstName: "Sam",
          lastName: "Doe",
          role: "EDITOR",
          joinedAt: "2026-01-02T03:04:05.000Z",
          lastActiveDay: "2026-08-28T00:00:00.000Z",
        },
      ],
      pagination: { page: 2, limit: 10, total: 1, totalPages: 1 },
    });
    expect(harness.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ spaceId, role: { in: expect.any(Array) } }),
        skip: 10,
        take: 10,
      })
    );
    expect(harness.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
  });

  it("rejects missing, restricted, and suspended memberships", async () => {
    for (const options of [
      { actorRole: null },
      { discipline: "restriction" as const },
      { discipline: "suspension" as const },
    ]) {
      const harness = createHarness(options);
      await expect(
        listSpaceMembers(
          { id: actorId },
          spaceId,
          { page: 1, limit: 25 },
          harness.client
        )
      ).rejects.toMatchObject({ status: 403 });
      expect(harness.findMany).not.toHaveBeenCalled();
    }
  });

  it("allows a current super-administrator without a membership", async () => {
    const harness = createHarness({ actorRole: null, isSuperAdmin: true });
    await expect(
      listSpaceMembers(
        { id: actorId },
        spaceId,
        { page: 1, limit: 25 },
        harness.client
      )
    ).resolves.toMatchObject({ users: [expect.objectContaining({ id: memberId })] });
  });

  it("returns not found before reading memberships for a missing space", async () => {
    const harness = createHarness({ spaceExists: false });
    await expect(
      listSpaceMembers(
        { id: actorId },
        spaceId,
        { page: 1, limit: 25 },
        harness.client
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(harness.findMany).not.toHaveBeenCalled();
  });
});
