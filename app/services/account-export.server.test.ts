import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";
import { exportAccountData } from "./account-export.server";

const actorId = "00000000-0000-4000-8000-000000000010";

describe("account data export", () => {
  it("exports owned data without credentials, storage keys or third-party PII", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: actorId,
      email: "member@example.com",
      firstName: "Safe",
      lastName: "Member",
      instagram: "safe.member",
      isSuperAdmin: false,
      codeOfConductAcceptedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      memberships: [],
      authoredPosts: [
        {
          id: "post-1",
          spaceId: "space-1",
          description: "My report",
          isAnonymous: true,
          isAdminOnly: false,
          status: "active",
          severity: null,
          verificationStatus: null,
          createdAt: new Date("2026-01-03T00:00:00.000Z"),
          updatedAt: new Date("2026-01-03T00:00:00.000Z"),
          reportedEntity: { id: "entity-1", name: "Entity", handles: [] },
          media: [
            {
              id: "media-1",
              fileName: "proof.jpg",
              mimeType: "image/jpeg",
              fileSize: 100,
              metadataStripped: true,
              isBlurred: true,
              createdAt: new Date("2026-01-03T00:00:00.000Z"),
            },
          ],
        },
      ],
      postedFlags: [],
      auditLogs: [],
      _count: { sentInvites: 1 },
    });
    const tx = { user: { findUnique } };
    const client = {
      $transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as PrismaClient;

    const result = await exportAccountData({ id: actorId }, client);
    const serialized = JSON.stringify(result);

    expect(result.profile.email).toBe("member@example.com");
    expect(result.contributions[0].media[0]).toMatchObject({
      fileName: "proof.jpg",
      metadataStripped: true,
    });
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("invited@example.com");
    expect(client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
  });
});
