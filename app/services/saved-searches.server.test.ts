import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";

import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  updateSavedSearch,
} from "./saved-searches.server";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const SPACE_ID = "33333333-3333-4333-8333-333333333333";
const SEARCH_ID = "44444444-4444-4444-8444-444444444444";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: SEARCH_ID,
    name: "Reported account",
    query: "reported.account",
    type: "all",
    spaceId: SPACE_ID,
    severity: null,
    verificationStatus: null,
    alertEnabled: true,
    alertHandle: "reported.account",
    createdAt: new Date("2026-08-25T10:00:00.000Z"),
    updatedAt: new Date("2026-08-25T10:00:00.000Z"),
    ...overrides,
  };
}

function harness(options: { membership?: boolean; ownedRow?: object | null } = {}) {
  const client = {
    userSpaceMembership: {
      findUnique: vi.fn().mockResolvedValue(
        options.membership === false ? null : { userId: USER_ID }
      ),
      findMany: vi.fn().mockResolvedValue([{ spaceId: SPACE_ID }]),
    },
    savedSearch: {
      findFirst: vi.fn().mockResolvedValue(options.ownedRow === undefined ? row() : options.ownedRow),
      findMany: vi.fn().mockResolvedValue([row()]),
      create: vi.fn().mockResolvedValue(row()),
      update: vi.fn().mockResolvedValue(row({ name: "Updated" })),
      delete: vi.fn().mockResolvedValue({ id: SEARCH_ID }),
    },
  } as unknown as PrismaClient;
  return { client, raw: client as unknown as { userSpaceMembership: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }; savedSearch: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } } };
}

const actor = { id: USER_ID, isSuperAdmin: false };

describe("saved searches", () => {
  it("rejects saving a space filter the user cannot access", async () => {
    const h = harness({ membership: false });

    await expect(
      createSavedSearch(
        actor,
        {
          name: "Private space",
          query: "account",
          type: "all",
          spaceId: SPACE_ID,
          alertEnabled: false,
        },
        h.client
      )
    ).rejects.toMatchObject({ status: 403 });

    expect(h.raw.savedSearch.create).not.toHaveBeenCalled();
  });

  it("lists only saved searches usable in the user's current spaces", async () => {
    const h = harness();

    await listSavedSearches(actor, h.client);

    expect(h.raw.savedSearch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: USER_ID,
          OR: [{ spaceId: null }, { spaceId: { in: [SPACE_ID] } }],
        },
      })
    );
  });

  it("does not reveal or mutate another user's search", async () => {
    const h = harness({ ownedRow: null });

    await expect(
      deleteSavedSearch(actor, SEARCH_ID, h.client)
    ).rejects.toMatchObject({ status: 404 });

    expect(h.raw.savedSearch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SEARCH_ID, userId: USER_ID } })
    );
    expect(h.raw.savedSearch.delete).not.toHaveBeenCalled();
  });

  it("keeps alert configuration valid across partial updates", async () => {
    const h = harness();

    await expect(
      updateSavedSearch(
        actor,
        SEARCH_ID,
        { alertHandle: null },
        h.client
      )
    ).rejects.toMatchObject({ status: 400 });

    expect(h.raw.savedSearch.update).not.toHaveBeenCalled();
  });

  it("allows a super admin to save a global space filter", async () => {
    const h = harness({ membership: false });

    await createSavedSearch(
      { id: OTHER_USER_ID, isSuperAdmin: true },
      {
        name: "Global review",
        query: "account",
        type: "posts",
        spaceId: SPACE_ID,
        alertEnabled: false,
      },
      h.client
    );

    expect(h.raw.userSpaceMembership.findUnique).not.toHaveBeenCalled();
    expect(h.raw.savedSearch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: OTHER_USER_ID }) })
    );
  });
});
