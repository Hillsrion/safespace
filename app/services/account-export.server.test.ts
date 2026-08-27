import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";
import { exportAccountData } from "./account-export.server";

const actorId = "00000000-0000-4000-8000-000000000010";
const date = "2026-01-01T00:00:00.000Z";
const ownMedia = { id: "media-1", fileName: "proof.jpg", mimeType: "image/jpeg", fileSize: 100, metadataStripped: true, isBlurred: true, createdAt: date };
const ownData = {
  contributions: [{
    id: "own-post", spaceId: "suspended", reportedEntityId: "entity-1", description: "My report",
    isAnonymous: true, isAdminOnly: false, status: "hidden", severity: null, verificationStatus: null,
    createdAt: date, updatedAt: date, media: [ownMedia],
  }],
  uploadedMedia: [{ ...ownMedia, postId: "own-post" }], moderationFlags: [], sentInviteCount: 1,
};

describe("account data export", () => {
  const tx = {
    user: { findUnique: vi.fn() }, $queryRaw: vi.fn(),
    space: { findMany: vi.fn() }, savedSearch: { findMany: vi.fn() },
    moderationAppeal: { findMany: vi.fn() }, disciplinaryAction: { findMany: vi.fn() },
  };
  const client = { $transaction: vi.fn(async (callback) => callback(tx)) } as unknown as PrismaClient;
  beforeEach(() => {
    vi.clearAllMocks();
    tx.user.findUnique.mockResolvedValue({
      id: actorId, email: "member@example.com", firstName: "Safe", lastName: "Member", instagram: null,
      isSuperAdmin: false, codeOfConductAcceptedAt: new Date(date), createdAt: new Date(date), updatedAt: new Date(date),
      memberships: [{ spaceId: "suspended", role: "EDITOR", joinedAt: new Date(date) }], auditLogs: [],
      password: "must-not-be-forwarded-even-if-a-query-changes",
    });
    tx.$queryRaw.mockResolvedValue([{ userId: actorId, ownData, ownReviews: [] }]);
    tx.space.findMany.mockResolvedValue([]);
    tx.savedSearch.findMany.mockResolvedValue([]);
    tx.moderationAppeal.findMany.mockResolvedValue([]);
    tx.disciplinaryAction.findMany.mockResolvedValue([]);
  });

  it("exports owned data after access loss without credentials, storage keys or third-party identity", async () => {
    const result = await exportAccountData({ id: actorId }, client);
    const serialized = JSON.stringify(result);
    expect(result.version).toBe(3);
    expect(result.profile.email).toBe("member@example.com");
    expect(result.contributions[0].media[0]).toMatchObject({ fileName: "proof.jpg", metadataStripped: true });
    expect(result.memberships[0]).toMatchObject({ spaceId: "suspended", spaceName: null });
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("uploaderId");
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
    expect(tx.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ memberships: { orderBy: { joinedAt: "asc" }, select: { role: true, joinedAt: true, spaceId: true } } }),
    }));
  });

  it("rejects a mismatched SQL identity, even if a privileged caller can read that profile", async () => {
    tx.$queryRaw.mockResolvedValue([{ userId: "someone-else", ownData }]);
    await expect(exportAccountData({ id: actorId }, client)).rejects.toMatchObject({ status: 401 });
  });

  it("fails closed if the SQL export grows an unsafe field", async () => {
    tx.$queryRaw.mockResolvedValue([{ userId: actorId, ownData: { ...ownData, storageKey: "secret" } }]);
    await expect(exportAccountData({ id: actorId }, client)).rejects.toThrow();
  });

  it("exports only the current reviewer's decisions through the strict SQL boundary", async () => {
    const ownReviews = [{ id: "decision", postId: "post", revision: 1, stage: 2, outcome: "request_changes", note: "My correction request", createdAt: date }];
    tx.$queryRaw.mockResolvedValue([{ userId: actorId, ownData, ownReviews }]);
    expect((await exportAccountData({ id: actorId }, client)).sensitiveReviewDecisions).toEqual(ownReviews);
    tx.$queryRaw.mockResolvedValue([{ userId: actorId, ownData, ownReviews: [{ ...ownReviews[0], reviewerUserId: "private" }] }]);
    await expect(exportAccountData({ id: actorId }, client)).rejects.toThrow();
  });
});
