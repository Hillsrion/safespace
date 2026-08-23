import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma";
import {
  createAdminSpace,
  deleteAdminSpace,
  getAdminSpace,
  listAdminAuditLogs,
  listAdminSpaces,
  SuperAdminSpaceError,
  updateAdminSpace,
} from "./superadmin-space.server";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "22222222-2222-4222-8222-222222222222";

function spaceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SPACE_ID,
    name: "Safety Team",
    description: "Private community",
    createdAt: new Date("2026-08-23T08:00:00.000Z"),
    updatedAt: new Date("2026-08-23T09:00:00.000Z"),
    _count: { memberships: 0, posts: 0, invites: 0, reportedEntities: 0 },
    ...overrides,
  };
}

function createHarness() {
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ isSuperAdmin: true }),
    },
    space: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(spaceRow()),
      create: vi.fn().mockResolvedValue(spaceRow()),
      update: vi.fn().mockResolvedValue(spaceRow()),
      delete: vi.fn().mockResolvedValue({ id: SPACE_ID }),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "audit-id" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const transaction = vi.fn(async (callback) => callback(tx));
  return {
    tx,
    transaction,
    client: { $transaction: transaction } as unknown as PrismaClient,
  };
}

describe("SuperAdmin space service", () => {
  it("re-reads the SuperAdmin flag before returning any space data", async () => {
    const h = createHarness();
    h.tx.user.findUnique.mockResolvedValue({ isSuperAdmin: false });

    await expect(
      listAdminSpaces({ id: ACTOR_ID }, { limit: 50 }, h.client)
    ).rejects.toMatchObject<Partial<SuperAdminSpaceError>>({ status: 403 });
    expect(h.tx.space.findMany).not.toHaveBeenCalled();
  });

  it("returns a minimal cursor page of spaces", async () => {
    const h = createHarness();
    h.tx.space.findMany.mockResolvedValue([
      spaceRow(),
      spaceRow({ id: "33333333-3333-4333-8333-333333333333", name: "Second" }),
    ]);

    const result = await listAdminSpaces(
      { id: ACTOR_ID },
      { limit: 1 },
      h.client
    );

    expect(h.tx.space.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, skip: 0, cursor: undefined })
    );
    expect(result).toEqual({
      spaces: [
        {
          id: SPACE_ID,
          name: "Safety Team",
          description: "Private community",
          createdAt: "2026-08-23T08:00:00.000Z",
          updatedAt: "2026-08-23T09:00:00.000Z",
          counts: { members: 0, posts: 0, invites: 0, reportedEntities: 0 },
        },
      ],
      nextCursor: SPACE_ID,
      hasMore: true,
    });
    expect(result.spaces[0]).not.toHaveProperty("createdBy");
  });

  it("returns 404 for a missing detail after checking current privileges", async () => {
    const h = createHarness();
    h.tx.space.findUnique.mockResolvedValue(null);

    await expect(getAdminSpace({ id: ACTOR_ID }, SPACE_ID, h.client)).rejects.toMatchObject({
      status: 404,
    });
    expect(h.tx.user.findUnique).toHaveBeenCalledBefore(h.tx.space.findUnique);
  });

  it("creates and audits a space atomically without a synthetic membership", async () => {
    const h = createHarness();

    await createAdminSpace(
      { id: ACTOR_ID },
      { name: "Safety Team", description: null },
      h.client
    );

    expect(h.tx.space.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: "Safety Team", description: null, createdBy: ACTOR_ID },
      })
    );
    expect(h.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: ACTOR_ID,
        action: "space_create",
        targetEntityType: "Space",
        targetEntityId: SPACE_ID,
        spaceId: SPACE_ID,
      },
    });
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("updates only effective fields and writes a non-sensitive audit record", async () => {
    const h = createHarness();
    h.tx.space.update.mockResolvedValue(spaceRow({ name: "Renamed" }));

    await updateAdminSpace(
      { id: ACTOR_ID },
      SPACE_ID,
      { name: "Renamed" },
      h.client
    );

    expect(h.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: ACTOR_ID,
        action: "space_update",
        targetEntityType: "Space",
        targetEntityId: SPACE_ID,
        spaceId: SPACE_ID,
        details: { changedFields: ["name"] },
      },
    });
    expect(h.tx.auditLog.create.mock.calls[0][0].data.details).not.toHaveProperty(
      "name"
    );

    const noChange = createHarness();
    await expect(
      updateAdminSpace(
        { id: ACTOR_ID },
        SPACE_ID,
        { name: "Safety Team" },
        noChange.client
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(noChange.tx.space.update).not.toHaveBeenCalled();
  });

  it("requires the exact deletion phrase and refuses every non-empty space", async () => {
    const wrongConfirmation = createHarness();
    await expect(
      deleteAdminSpace(
        { id: ACTOR_ID },
        SPACE_ID,
        "Safety Team",
        wrongConfirmation.client
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(wrongConfirmation.tx.space.delete).not.toHaveBeenCalled();

    const nonEmpty = createHarness();
    nonEmpty.tx.space.findUnique.mockResolvedValue(
      spaceRow({
        _count: { memberships: 1, posts: 2, invites: 0, reportedEntities: 1 },
      })
    );
    await expect(
      deleteAdminSpace(
        { id: ACTOR_ID },
        SPACE_ID,
        "DELETE Safety Team",
        nonEmpty.client
      )
    ).rejects.toMatchObject({
      status: 409,
      details: { members: 1, posts: 2, invites: 0, reportedEntities: 1 },
    });
    expect(nonEmpty.tx.auditLog.updateMany).not.toHaveBeenCalled();
    expect(nonEmpty.tx.space.delete).not.toHaveBeenCalled();
  });

  it("preserves old audits and atomically audits deletion of an empty space", async () => {
    const h = createHarness();

    await expect(
      deleteAdminSpace(
        { id: ACTOR_ID },
        SPACE_ID,
        "DELETE Safety Team",
        h.client
      )
    ).resolves.toEqual({ deletedSpaceId: SPACE_ID });

    expect(h.tx.auditLog.updateMany).toHaveBeenCalledWith({
      where: { spaceId: SPACE_ID },
      data: { spaceId: null },
    });
    expect(h.tx.space.delete).toHaveBeenCalledWith({ where: { id: SPACE_ID } });
    expect(h.tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: ACTOR_ID,
        action: "space_delete",
        targetEntityType: "Space",
        targetEntityId: SPACE_ID,
        spaceId: null,
      },
    });
    expect(h.tx.auditLog.updateMany).toHaveBeenCalledBefore(h.tx.space.delete);
    expect(h.tx.space.delete).toHaveBeenCalledBefore(h.tx.auditLog.create);
  });

  it("paginates filtered audit metadata without selecting details or actor PII", async () => {
    const h = createHarness();
    h.tx.auditLog.findMany.mockResolvedValue([
      {
        id: "33333333-3333-4333-8333-333333333333",
        actorUserId: ACTOR_ID,
        action: "space_update",
        targetEntityType: "Space",
        targetEntityId: SPACE_ID,
        spaceId: SPACE_ID,
        createdAt: new Date("2026-08-23T11:00:00.000Z"),
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        actorUserId: ACTOR_ID,
        action: "space_update",
        targetEntityType: "Space",
        targetEntityId: SPACE_ID,
        spaceId: SPACE_ID,
        createdAt: new Date("2026-08-23T10:00:00.000Z"),
      },
    ]);

    const result = await listAdminAuditLogs(
      { id: ACTOR_ID },
      { limit: 1, spaceId: SPACE_ID, action: "space_update" },
      h.client
    );

    const query = h.tx.auditLog.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ spaceId: SPACE_ID, action: "space_update" });
    expect(query.select).not.toHaveProperty("details");
    expect(query.select).not.toHaveProperty("actor");
    expect(result).toEqual({
      logs: [
        expect.objectContaining({
          id: "33333333-3333-4333-8333-333333333333",
          createdAt: "2026-08-23T11:00:00.000Z",
        }),
      ],
      nextCursor: "33333333-3333-4333-8333-333333333333",
      hasMore: true,
    });
  });

  it("redacts actor identifiers from contribution audit metadata", async () => {
    const h = createHarness();
    h.tx.auditLog.findMany.mockResolvedValue([
      {
        id: "33333333-3333-4333-8333-333333333333",
        actorUserId: ACTOR_ID,
        action: "post_create",
        targetEntityType: "Post",
        targetEntityId: "44444444-4444-4444-8444-444444444444",
        spaceId: SPACE_ID,
        createdAt: new Date("2026-08-23T11:00:00.000Z"),
      },
    ]);

    const result = await listAdminAuditLogs(
      { id: ACTOR_ID },
      { limit: 50 },
      h.client
    );

    expect(result.logs[0]).toMatchObject({
      targetEntityType: "Post",
      actorUserId: null,
    });
  });

  it("does not complete update or deletion transactions when audit writing fails", async () => {
    const update = createHarness();
    update.tx.auditLog.create.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      updateAdminSpace(
        { id: ACTOR_ID },
        SPACE_ID,
        { name: "Renamed" },
        update.client
      )
    ).rejects.toThrow("audit unavailable");
    expect(update.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });

    const deletion = createHarness();
    deletion.tx.auditLog.create.mockRejectedValue(new Error("audit unavailable"));
    await expect(
      deleteAdminSpace(
        { id: ACTOR_ID },
        SPACE_ID,
        "DELETE Safety Team",
        deletion.client
      )
    ).rejects.toThrow("audit unavailable");
    expect(deletion.tx.space.delete).toHaveBeenCalledOnce();
    // Prisma rolls the preceding delete back when this callback rejects.
    expect(deletion.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("maps unique-name database races to a 409", async () => {
    const h = createHarness();
    h.transaction.mockRejectedValue({ code: "P2002" });

    await expect(
      createAdminSpace(
        { id: ACTOR_ID },
        { name: "Safety Team", description: null },
        h.client
      )
    ).rejects.toMatchObject({ status: 409 });
  });
});
