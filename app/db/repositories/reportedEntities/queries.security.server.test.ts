import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";

const mocks = {
  findUser: vi.fn(),
  findEntity: vi.fn(),
  findEntityUnique: vi.fn(),
  findPosts: vi.fn(),
};

const client = {
  user: { findUnique: mocks.findUser },
  reportedEntity: {
    findFirst: mocks.findEntity,
    findUnique: mocks.findEntityUnique,
  },
  post: { findMany: mocks.findPosts },
} as unknown as PrismaClient;

import { getReportedEntityPosts } from "./queries.server";

describe("reported entity post access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPosts.mockResolvedValue([]);
  });

  it("pins posts to the accessible entity's own space and membership", async () => {
    mocks.findUser.mockResolvedValue({
      id: "user-1",
      isSuperAdmin: false,
      memberships: [{ spaceId: "space-1", role: "EDITOR" }],
    });
    mocks.findEntity.mockResolvedValue({ spaceId: "space-1" });

    await getReportedEntityPosts("entity-1", "user-1", client);

    expect(mocks.findEntity).toHaveBeenCalledWith({
      where: {
        id: "entity-1",
        space: { memberships: { some: { userId: "user-1" } } },
      },
      select: { spaceId: true },
    });
    expect(mocks.findPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reportedEntityId: "entity-1",
          spaceId: "space-1",
          status: "active",
          space: { memberships: { some: { userId: "user-1" } } },
        }),
      })
    );
  });

  it("does not query posts when the entity is outside the user's spaces", async () => {
    mocks.findUser.mockResolvedValue({
      id: "user-1",
      isSuperAdmin: false,
      memberships: [{ spaceId: "space-1", role: "EDITOR" }],
    });
    mocks.findEntity.mockResolvedValue(null);

    await expect(
      getReportedEntityPosts("entity-other", "user-1", client)
    ).resolves.toEqual([]);
    expect(mocks.findPosts).not.toHaveBeenCalled();
  });

  it("keeps a super admin query pinned to the entity space and redacts anonymity", async () => {
    mocks.findUser.mockResolvedValue({
      id: "root-1",
      isSuperAdmin: true,
      memberships: [],
    });
    mocks.findEntity.mockResolvedValue({ spaceId: "space-1" });
    mocks.findPosts.mockResolvedValue([
      {
        id: "post-1",
        spaceId: "space-1",
        authorId: "secret-author",
        reportedEntityId: "entity-1",
        description: "Report",
        isAnonymous: true,
        isAdminOnly: true,
        status: "hidden",
        severity: null,
        verificationStatus: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        author: {
          id: "secret-author",
          firstName: "Secret",
          lastName: "Person",
          instagram: "secret",
        },
        media: [
          {
            id: "media-1",
            uploaderId: "secret-author",
            fileName: "proof.jpg",
            mimeType: "image/jpeg",
            evidenceCategory: "document",
            caption: "Contrat signé",
            sortOrder: 0,
          },
        ],
        space: { id: "space-1", name: "Space One" },
        reportedEntity: {
          id: "entity-1",
          name: "Entity",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          handles: [],
        },
      },
    ]);

    const posts = await getReportedEntityPosts("entity-1", "root-1", client);

    expect(mocks.findPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reportedEntityId: "entity-1", spaceId: "space-1" },
      })
    );
    expect(posts[0]).not.toHaveProperty("authorId");
    expect(posts[0].author).toEqual(
      expect.objectContaining({ id: "anonymous", name: "Anonymous" })
    );
    expect(posts[0]).toMatchObject({
      viewerRole: "SUPERADMIN",
      viewerCanEdit: true,
      viewerCanDelete: true,
      viewerCanModerate: true,
    });
    expect(posts[0].media[0]).not.toHaveProperty("uploaderId");
    expect(posts[0].media[0]).toMatchObject({ type: "image", url: "/resources/api/media/media-1", evidenceCategory: "document", caption: "Contrat signé" });
  });
});
