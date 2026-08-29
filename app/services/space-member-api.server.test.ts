import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";

const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("./auth.server", () => ({ getCurrentUser: auth.getCurrentUser }));

import {
  getSpaceForMember,
  spaceMemberItemLoader,
} from "./space-member-api.server";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "22222222-2222-4222-8222-222222222222";
const DATE = new Date("2026-08-29T10:00:00.000Z");

function harness(options: {
  role?: string | null;
  isSuperAdmin?: boolean;
  discipline?: "restriction" | "suspension" | null;
  space?: object | null;
} = {}) {
  const client = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        isSuperAdmin: options.isSuperAdmin ?? false,
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
    space: {
      findFirst: vi.fn().mockResolvedValue(
        options.space === null
          ? null
          : options.space ?? {
              id: SPACE_ID,
              name: "Espace privé",
              description: "Description membre",
              createdAt: DATE,
              updatedAt: DATE,
            }
      ),
    },
  };
  return { client: client as unknown as PrismaClient, mocks: client };
}

describe("member space API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getCurrentUser.mockResolvedValue({ id: USER_ID });
  });

  it("returns a minimized space DTO with the effective member role", async () => {
    const h = harness({ role: "EDITOR", discipline: "restriction" });

    await expect(getSpaceForMember(USER_ID, SPACE_ID, h.client)).resolves.toEqual({
      id: SPACE_ID,
      name: "Espace privé",
      description: "Description membre",
      createdAt: DATE.toISOString(),
      updatedAt: DATE.toISOString(),
      currentUserRole: "READ_ONLY",
    });
    expect(h.mocks.space.findFirst).toHaveBeenCalledWith({
      where: { id: SPACE_ID },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("makes a suspension, missing membership and missing row indistinguishable", async () => {
    for (const options of [
      { role: "ADMIN", discipline: "suspension" as const },
      { role: null },
      { role: "EDITOR", space: null },
    ]) {
      const h = harness(options);
      await expect(getSpaceForMember(USER_ID, SPACE_ID, h.client)).rejects.toMatchObject({
        status: 404,
        message: "Space not found",
      });
    }
  });

  it("returns a stable explicit role for super-admin break-glass access", async () => {
    const h = harness({ isSuperAdmin: true, role: null });
    await expect(getSpaceForMember(USER_ID, SPACE_ID, h.client)).resolves.toMatchObject({
      id: SPACE_ID,
      currentUserRole: "SUPERADMIN",
    });
    expect(h.mocks.userSpaceMembership.findUnique).not.toHaveBeenCalled();
  });

  it("enforces the exact GET path/query/authentication contract", async () => {
    const invalidMethod = await spaceMemberItemLoader({
      request: new Request(`https://safe.test/resources/api/spaces/${SPACE_ID}`, {
        method: "POST",
      }),
      params: { spaceId: SPACE_ID },
      context: {},
    });
    expect(invalidMethod.status).toBe(405);
    expect(invalidMethod.headers.get("Allow")).toBe("GET");

    const invalidPath = await spaceMemberItemLoader({
      request: new Request("https://safe.test/resources/api/spaces/not-a-uuid"),
      params: { spaceId: "not-a-uuid" },
      context: {},
    });
    expect(invalidPath.status).toBe(400);

    const invalidQuery = await spaceMemberItemLoader({
      request: new Request(
        `https://safe.test/resources/api/spaces/${SPACE_ID}?include=members`
      ),
      params: { spaceId: SPACE_ID },
      context: {},
    });
    expect(invalidQuery.status).toBe(400);

    auth.getCurrentUser.mockResolvedValueOnce(null);
    const unauthenticated = await spaceMemberItemLoader({
      request: new Request(`https://safe.test/resources/api/spaces/${SPACE_ID}`),
      params: { spaceId: SPACE_ID },
      context: {},
    });
    expect(unauthenticated.status).toBe(401);
  });
});
