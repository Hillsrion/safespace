import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma";
import {
  getAdminUser,
  listAdminUsers,
  SuperAdminUserError,
} from "./superadmin-user.server";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const SPACE_ID = "33333333-3333-4333-8333-333333333333";

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: "member@example.com",
    firstName: "Safe",
    lastName: "Member",
    isSuperAdmin: false,
    createdAt: new Date("2026-08-23T08:00:00.000Z"),
    updatedAt: new Date("2026-08-23T09:00:00.000Z"),
    _count: { memberships: 2 },
    ...overrides,
  };
}

function detailRow() {
  return {
    ...listRow(),
    codeOfConductAcceptedAt: new Date("2026-08-20T08:00:00.000Z"),
    memberships: [
      {
        role: "EDITOR",
        joinedAt: new Date("2026-08-21T08:00:00.000Z"),
        space: { id: SPACE_ID, name: "Safety Team" },
      },
    ],
    _count: {
      memberships: 1,
      authoredPosts: 3,
      uploadedMedia: 1,
      postedFlags: 2,
    },
  };
}

function createHarness() {
  const findUnique = vi.fn(async ({ where }) =>
    where.id === ACTOR_ID ? { isSuperAdmin: true } : detailRow()
  );
  const tx = {
    user: {
      findUnique,
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const transaction = vi.fn(async (operation) => operation(tx));
  return {
    tx,
    transaction,
    client: { $transaction: transaction } as unknown as PrismaClient,
  };
}

describe("SuperAdmin global user service", () => {
  it("re-reads SuperAdmin authorization before querying global users", async () => {
    const h = createHarness();
    h.tx.user.findUnique.mockResolvedValue({ isSuperAdmin: false });

    await expect(
      listAdminUsers({ id: ACTOR_ID }, { limit: 50 }, h.client)
    ).rejects.toMatchObject<Partial<SuperAdminUserError>>({ status: 403 });
    expect(h.tx.user.findMany).not.toHaveBeenCalled();
  });

  it("returns a stable, minimized cursor page", async () => {
    const h = createHarness();
    h.tx.user.findMany.mockResolvedValue([
      listRow(),
      listRow({ id: "44444444-4444-4444-8444-444444444444" }),
    ]);

    const result = await listAdminUsers(
      { id: ACTOR_ID },
      { limit: 1 },
      h.client
    );

    expect(result).toEqual({
      users: [
        {
          id: USER_ID,
          email: "member@example.com",
          firstName: "Safe",
          lastName: "Member",
          isSuperAdmin: false,
          createdAt: "2026-08-23T08:00:00.000Z",
          updatedAt: "2026-08-23T09:00:00.000Z",
          membershipCount: 2,
        },
      ],
      nextCursor: USER_ID,
      hasMore: true,
    });
    expect(result.users[0]).not.toHaveProperty("password");
    expect(result.users[0]).not.toHaveProperty("instagram");
    expect(h.tx.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 2,
        skip: 0,
      })
    );
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
  });

  it("combines role and space in the same membership predicate", async () => {
    const h = createHarness();

    await listAdminUsers(
      { id: ACTOR_ID },
      {
        limit: 20,
        q: "safe",
        isSuperAdmin: false,
        spaceId: SPACE_ID,
        role: "EDITOR",
      },
      h.client
    );

    const where = h.tx.user.findMany.mock.calls[0][0].where;
    expect(where.isSuperAdmin).toBe(false);
    expect(where.memberships).toEqual({
      some: {
        spaceId: SPACE_ID,
        role: { in: ["EDITOR", "Editor", "editor"] },
      },
    });
    expect(where.OR).toHaveLength(3);
  });

  it("returns a useful detail without secrets or optional social PII", async () => {
    const h = createHarness();

    const result = await getAdminUser({ id: ACTOR_ID }, USER_ID, h.client);

    expect(result).toEqual({
      id: USER_ID,
      email: "member@example.com",
      firstName: "Safe",
      lastName: "Member",
      isSuperAdmin: false,
      createdAt: "2026-08-23T08:00:00.000Z",
      updatedAt: "2026-08-23T09:00:00.000Z",
      membershipCount: 1,
      codeOfConductAccepted: true,
      memberships: [
        {
          spaceId: SPACE_ID,
          spaceName: "Safety Team",
          role: "EDITOR",
          joinedAt: "2026-08-21T08:00:00.000Z",
        },
      ],
      counts: { authoredPosts: 3, uploadedMedia: 1, postedFlags: 2 },
    });
    expect(result).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("instagram");
    const detailSelect = h.tx.user.findUnique.mock.calls[1][0].select;
    expect(detailSelect).not.toHaveProperty("password");
    expect(detailSelect).not.toHaveProperty("instagram");
  });

  it("returns 404 for a missing user only after authorization succeeds", async () => {
    const h = createHarness();
    h.tx.user.findUnique.mockImplementation(async ({ where }) =>
      where.id === ACTOR_ID ? { isSuperAdmin: true } : null
    );

    await expect(
      getAdminUser({ id: ACTOR_ID }, USER_ID, h.client)
    ).rejects.toMatchObject({ status: 404 });
    expect(h.tx.user.findUnique).toHaveBeenCalledTimes(2);
  });
});
