import { vi, describe, it, expect, beforeEach } from "vitest";
import { prisma } from "~/db/prisma.server";
import {
  getReportedEntityById,
  getReportedEntityPosts,
} from "./queries.server";
import type { ReportedEntityWithHandles, ReportedEntityPost } from "./types";

// Mock Prisma
vi.mock("~/db/prisma.server", () => {
  const actualPrisma = vi.importActual("~/db/prisma.server");
  return {
    ...actualPrisma,
    prisma: {
      reportedEntity: {
        findUnique: vi.fn(),
      },
      post: {
        findMany: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    },
  };
});

const mockPrisma = prisma as unknown as {
  reportedEntity: { findUnique: ReturnType<typeof vi.fn> };
  post: { findMany: ReturnType<typeof vi.fn> };
  user: { findUnique: ReturnType<typeof vi.fn> };
};

describe("ReportedEntity Repository - Queries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getReportedEntityById", () => {
    it("should return entity with handles if found", async () => {
      const mockEntity: ReportedEntityWithHandles = {
        id: "entity1",
        name: "Test Entity", // Assuming a name property
        handles: [{ id: "h1", handle: "handle1", platform: "Twitter" }], // Assuming platform
      };
      mockPrisma.reportedEntity.findUnique.mockResolvedValue(mockEntity);

      const result = await getReportedEntityById("entity1");

      expect(mockPrisma.reportedEntity.findUnique).toHaveBeenCalledWith({
        where: { id: "entity1" },
        include: { handles: true },
      });
      expect(result).toEqual(mockEntity);
    });

    it("should return null if entity not found", async () => {
      mockPrisma.reportedEntity.findUnique.mockResolvedValue(null);
      const result = await getReportedEntityById("unknown");
      expect(result).toBeNull();
    });
  });

  describe("getReportedEntityPosts", () => {
    const mockUserId = "user1";
    const mockReportedEntityId = "entity1";

    const mockUser = {
      id: mockUserId,
      isSuperAdmin: false,
      spaceMemberships: [{ spaceId: "space1" }, { spaceId: "space2" }],
    };

    const baseTime = new Date();
    const mockRawPostsFromPrisma = [
      {
        id: "post1",
        content: "Post 1 by user1",
        userId: mockUserId,
        reportedEntityId: mockReportedEntityId,
        createdAt: baseTime,
        updatedAt: baseTime,
        status: "published",
        author: { id: mockUserId, name: "User One", username: "userone", avatarUrl: null, role: "user" },
        space: { id: "space1", name: "Space One" /* url will be mapped if logic exists */ },
        media: [{id: "m1", url:"url1", type: "image"}],
        reportedEntity: {id: mockReportedEntityId, name: "Entity X", handles: []}
      },
      {
        id: "post2",
        content: "Post 2 in space1",
        userId: "user2",
        spaceId: "space1",
        reportedEntityId: mockReportedEntityId,
        createdAt: new Date(baseTime.getTime() - 10000),
        updatedAt: new Date(baseTime.getTime() - 10000),
        status: "published",
        author: { id: "user2", name: "User Two", username: "usertwo", avatarUrl: null, role: "user" },
        space: { id: "space1", name: "Space One" },
        media: [],
        reportedEntity: {id: mockReportedEntityId, name: "Entity X", handles: []}
      },
    ];

    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    });

    it("should fetch posts with included relations and map them", async () => {
      // Simulate Prisma returning posts with relations
      mockPrisma.post.findMany.mockResolvedValue(mockRawPostsFromPrisma);

      const results = await getReportedEntityPosts(mockReportedEntityId, mockUserId);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUserId },
        include: { spaceMemberships: { select: { spaceId: true } } },
      });
      expect(mockPrisma.post.findMany).toHaveBeenCalledWith({
        where: {
          reportedEntityId: mockReportedEntityId,
          OR: [
            { userId: mockUserId },
            { spaceId: { in: ["space1", "space2"] } },
          ],
        },
        include: expect.any(Object), // Check that include is present
        orderBy: { createdAt: "desc" },
      });

      expect(results.length).toBe(2);
      // Check the first post for correct mapping and structure
      const firstPost = results[0];
      expect(firstPost.id).toBe("post1");
      expect(firstPost.author.name).toBe("User One");
      expect(firstPost.space?.name).toBe("Space One");
      expect(firstPost.media?.length).toBe(1);
      expect(firstPost.reportedEntity?.name).toBe("Entity X");
      expect(typeof firstPost.createdAt).toBe("string"); // Due to toISOString()

      // Check include structure in the actual call
      const findManyCall = mockPrisma.post.findMany.mock.calls[0][0];
      expect(findManyCall.include).toEqual({
            author: { select: { id: true, name: true, username: true, avatarUrl: true, role: true }},
            space: { select: { id: true, name: true }},
            media: true,
            reportedEntity: { include: { handles: true }},
      });
    });

    it("should apply fallbacks for author if parts are missing", async () => {
      const postWithPartialAuthor = {
        ...mockRawPostsFromPrisma[0],
        author: { id: mockUserId, name: null, username: "userone", avatarUrl: null, role: null }, // name and role are null
      };
      mockPrisma.post.findMany.mockResolvedValue([postWithPartialAuthor]);
      const results = await getReportedEntityPosts(mockReportedEntityId, mockUserId);
      expect(results[0].author.name).toBe("userone"); // Fallback to username
      expect(results[0].author.role).toBe("user");   // Fallback to 'user'
    });


    it("should return empty array if user not found (repo throws error)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      // The actual function throws an error, so we test for that
      await expect(
        getReportedEntityPosts(mockReportedEntityId, "unknownUser")
      ).rejects.toThrow("User not found");
    });

    it("should return empty array if no posts match criteria", async () => {
      mockPrisma.post.findMany.mockResolvedValue([]);
      const result = await getReportedEntityPosts(mockReportedEntityId, mockUserId);
      expect(result).toEqual([]);
    });

     it("should handle users with no space memberships", async () => {
      const userNoSpaces = { ...mockUser, spaceMemberships: [] };
      mockPrisma.user.findUnique.mockResolvedValue(userNoSpaces);
      mockPrisma.post.findMany.mockResolvedValue([mockPosts[0]]); // Only own posts

      const result = await getReportedEntityPosts(mockReportedEntityId, mockUserId);

      expect(mockPrisma.post.findMany).toHaveBeenCalledWith({
        where: {
          reportedEntityId: mockReportedEntityId,
          OR: [
            { userId: mockUserId },
            { spaceId: { in: [] } }, // Empty array for spaces
          ],
        },
      });
      expect(result).toEqual([mockPosts[0]]);
    });
  });
});
