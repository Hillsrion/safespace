import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";

const mocks = {
  findMemberships: vi.fn(),
  findPosts: vi.fn(),
  findUser: vi.fn(),
};

const client = {
  user: { findUnique: mocks.findUser },
  userSpaceMembership: { findMany: mocks.findMemberships },
  post: { findMany: mocks.findPosts },
} as unknown as PrismaClient;

import { getAllPosts, getSpacePosts } from "./queries.server";

const anonymousPost = {
  id: "post-1",
  spaceId: "space-1",
  authorId: "secret-author",
  reportedEntityId: "entity-1",
  description: "Report",
  isAnonymous: true,
  isAdminOnly: false,
  status: "active" as const,
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
      storageKey: "evidence/private.jpg",
      sha256: "private-hash",
      fileName: "proof.jpg",
    },
  ],
  space: { id: "space-1", name: "Space One" },
  reportedEntity: { id: "entity-1", name: "Entity", handles: [] },
};

describe("secured post feed queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPosts.mockResolvedValue([anonymousPost]);
  });

  it("scopes a member feed and derives per-space viewer permissions", async () => {
    mocks.findMemberships.mockResolvedValue([
      { spaceId: "space-1", role: "Moderator" },
    ]);

    const result = await getSpacePosts("moderator-1", {}, client);

    expect(mocks.findPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          spaceId: { in: ["space-1"] },
          status: "active",
        }),
      })
    );
    expect(result.posts[0]).toMatchObject({
      authorId: null,
      author: { id: "anonymous" },
      viewerRole: "MODERATOR",
      viewerCanEdit: true,
      viewerCanDelete: true,
      viewerCanModerate: true,
    });
    expect(result.posts[0].media[0]).not.toHaveProperty("uploaderId");
    expect(result.posts[0].media[0]).not.toHaveProperty("storageKey");
    expect(result.posts[0].media[0]).not.toHaveProperty("sha256");
    expect(result.posts[0].media[0]).toHaveProperty(
      "url",
      "/resources/api/media/media-1"
    );
  });

  it("returns no data when a requested space is outside current memberships", async () => {
    mocks.findMemberships.mockResolvedValue([
      { spaceId: "space-1", role: "EDITOR" },
    ]);

    const result = await getSpacePosts(
      "editor-1",
      { spaceId: "space-2" },
      client
    );

    expect(result).toEqual({
      posts: [],
      nextCursor: undefined,
      hasNextPage: false,
    });
    expect(mocks.findPosts).not.toHaveBeenCalled();
  });

  it("keeps anonymous authors hidden from super admins and marks global capability", async () => {
    mocks.findUser.mockResolvedValue({ isSuperAdmin: true });

    const result = await getAllPosts("root-1", {}, client);

    expect(result.posts[0]).toMatchObject({
      authorId: null,
      author: { id: "anonymous" },
      viewerRole: "SUPERADMIN",
      viewerCanEdit: true,
      viewerCanDelete: true,
      viewerCanModerate: true,
    });
  });
});
