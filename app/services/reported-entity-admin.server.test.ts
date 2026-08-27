import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";

import {
  createReportedEntityForAdmin,
  deleteReportedEntityForAdmin,
  getReportedEntityForAdmin,
  listReportedEntitiesForAdmin,
  ReportedEntityAdminError,
  updateReportedEntityForAdmin,
} from "./reported-entity-admin.server";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_SPACE_ID = "33333333-3333-4333-8333-333333333333";
const ENTITY_ID = "44444444-4444-4444-8444-444444444444";
const HANDLE_ID = "55555555-5555-4555-8555-555555555555";

function entityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTITY_ID,
    name: "Reported account",
    spaceId: SPACE_ID,
    createdAt: new Date("2026-08-23T10:00:00.000Z"),
    updatedAt: new Date("2026-08-23T11:00:00.000Z"),
    handles: [
      {
        id: HANDLE_ID,
        platform: "Instagram",
        handle: "reported.account",
        createdAt: new Date("2026-08-23T10:00:00.000Z"),
      },
    ],
    _count: { posts: 0 },
    ...overrides,
  };
}

function createHarness(options: { role?: string; isSuperAdmin?: boolean; discipline?: "restriction" | "suspension" } = {}) {
  const tx = {
    disciplinaryAction: {
      findFirst: vi.fn().mockResolvedValue(options.discipline ? { kind: options.discipline } : null),
    },
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ isSuperAdmin: options.isSuperAdmin ?? false }),
    },
    userSpaceMembership: {
      findUnique: vi.fn().mockResolvedValue({ role: options.role ?? "Admin" }),
    },
    space: {
      findUnique: vi.fn().mockResolvedValue({ id: SPACE_ID }),
    },
    reportedEntity: {
      findFirst: vi.fn().mockResolvedValue(entityRow()),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(entityRow()),
      update: vi.fn().mockResolvedValue(entityRow()),
      delete: vi.fn().mockResolvedValue({ id: ENTITY_ID }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-id" }),
    },
  };
  const transaction = vi.fn(async (callback) => callback(tx));
  return {
    tx,
    transaction,
    client: { $transaction: transaction } as unknown as PrismaClient,
  };
}

describe("reported entity admin service", () => {
  it("does not expose entity administration during an active restriction", async () => {
    const h = createHarness({ discipline: "restriction" });
    await expect(listReportedEntitiesForAdmin({ id: ACTOR_ID }, SPACE_ID, { limit: 50 }, h.client))
      .rejects.toMatchObject({ status: 403 });
    expect(h.tx.reportedEntity.findMany).not.toHaveBeenCalled();
  });

  it("re-reads authorization and denies non-admin members before entity access", async () => {
    const h = createHarness({ role: "EDITOR" });

    await expect(
      listReportedEntitiesForAdmin({ id: ACTOR_ID }, SPACE_ID, { limit: 50 }, h.client)
    ).rejects.toMatchObject<Partial<ReportedEntityAdminError>>({ status: 403 });

    expect(h.tx.user.findUnique).toHaveBeenCalledWith({
      where: { id: ACTOR_ID },
      select: { isSuperAdmin: true },
    });
    expect(h.tx.reportedEntity.findMany).not.toHaveBeenCalled();
  });

  it("allows a current SuperAdmin without consulting space membership", async () => {
    const h = createHarness({ isSuperAdmin: true });

    await listReportedEntitiesForAdmin(
      { id: ACTOR_ID },
      SPACE_ID,
      { limit: 50 },
      h.client
    );

    expect(h.tx.userSpaceMembership.findUnique).not.toHaveBeenCalled();
    expect(h.tx.reportedEntity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { spaceId: SPACE_ID } })
    );
  });

  it("scopes entity detail to the path space and returns 404 for cross-space IDs", async () => {
    const h = createHarness();
    h.tx.reportedEntity.findFirst.mockResolvedValue(null);

    await expect(
      getReportedEntityForAdmin(
        { id: ACTOR_ID },
        SPACE_ID,
        ENTITY_ID,
        h.client
      )
    ).rejects.toMatchObject({ status: 404 });

    expect(h.tx.reportedEntity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ENTITY_ID, spaceId: SPACE_ID } })
    );
  });

  it("rejects a cursor from another space instead of using it as an IDOR oracle", async () => {
    const h = createHarness();
    h.tx.reportedEntity.findFirst.mockResolvedValue(null);

    await expect(
      listReportedEntitiesForAdmin(
        { id: ACTOR_ID },
        SPACE_ID,
        { cursor: ENTITY_ID, limit: 10 },
        h.client
      )
    ).rejects.toMatchObject({ status: 404 });

    expect(h.tx.reportedEntity.findFirst).toHaveBeenCalledWith({
      where: { id: ENTITY_ID, spaceId: SPACE_ID },
      select: { id: true },
    });
    expect(h.tx.reportedEntity.findMany).not.toHaveBeenCalled();
  });

  it("creates an entity and its audit atomically in the authorized space", async () => {
    const h = createHarness();

    await createReportedEntityForAdmin(
      { id: ACTOR_ID },
      SPACE_ID,
      {
        name: "Reported account",
        handles: [{ platform: "Instagram", handle: "reported.account" }],
      },
      h.client
    );

    expect(h.tx.reportedEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: "Reported account",
          spaceId: SPACE_ID,
          addedByUserId: ACTOR_ID,
          handles: {
            create: [{ platform: "Instagram", handle: "reported.account" }],
          },
        },
      })
    );
    expect(h.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: ACTOR_ID,
        action: "entity_add",
        targetEntityType: "ReportedEntity",
        targetEntityId: ENTITY_ID,
        spaceId: SPACE_ID,
      },
    });
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("replaces handles atomically and audits only changed field names", async () => {
    const h = createHarness();
    h.tx.reportedEntity.update.mockResolvedValue(
      entityRow({
        handles: [
          {
            id: HANDLE_ID,
            platform: "Website",
            handle: "example.test",
            createdAt: new Date("2026-08-23T12:00:00.000Z"),
          },
        ],
      })
    );

    await updateReportedEntityForAdmin(
      { id: ACTOR_ID },
      SPACE_ID,
      ENTITY_ID,
      { handles: [{ platform: "Website", handle: "example.test" }] },
      h.client
    );

    expect(h.tx.reportedEntity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ENTITY_ID, spaceId: SPACE_ID },
        data: {
          handles: {
            deleteMany: {},
            create: [{ platform: "Website", handle: "example.test" }],
          },
        },
      })
    );
    expect(h.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: ACTOR_ID,
        action: "entity_update",
        targetEntityType: "ReportedEntity",
        targetEntityId: ENTITY_ID,
        spaceId: SPACE_ID,
        details: { changedFields: ["handles"] },
      },
    });
  });

  it("refuses deletion when posts are linked and reports only the blocker count", async () => {
    const h = createHarness();
    h.tx.reportedEntity.findFirst.mockResolvedValue({
      id: ENTITY_ID,
      spaceId: OTHER_SPACE_ID,
      _count: { posts: 2 },
    });

    await expect(
      deleteReportedEntityForAdmin(
        { id: ACTOR_ID },
        SPACE_ID,
        ENTITY_ID,
        h.client
      )
    ).rejects.toMatchObject({ status: 409, details: { posts: 2 } });

    expect(h.tx.reportedEntity.delete).not.toHaveBeenCalled();
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("deletes an unreferenced entity and audits in the same transaction", async () => {
    const h = createHarness();
    h.tx.reportedEntity.findFirst.mockResolvedValue({
      id: ENTITY_ID,
      _count: { posts: 0 },
    });

    await expect(
      deleteReportedEntityForAdmin(
        { id: ACTOR_ID },
        SPACE_ID,
        ENTITY_ID,
        h.client
      )
    ).resolves.toEqual({ deletedEntityId: ENTITY_ID });

    expect(h.tx.reportedEntity.delete).toHaveBeenCalledWith({
      where: { id: ENTITY_ID, spaceId: SPACE_ID },
    });
    expect(h.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: ACTOR_ID,
        action: "entity_delete",
        targetEntityType: "ReportedEntity",
        targetEntityId: ENTITY_ID,
        spaceId: SPACE_ID,
      },
    });
  });

  it("propagates audit failure through the mutation transaction", async () => {
    const h = createHarness();
    h.tx.auditLog.create.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      createReportedEntityForAdmin(
        { id: ACTOR_ID },
        SPACE_ID,
        {
          name: "Reported account",
          handles: [{ platform: "Instagram", handle: "reported.account" }],
        },
        h.client
      )
    ).rejects.toThrow("audit unavailable");
    expect(h.tx.reportedEntity.create).toHaveBeenCalledOnce();
  });
});
