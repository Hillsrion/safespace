import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "~/generated/prisma";

const mocks = {
  findMemberships: vi.fn(),
  findPosts: vi.fn(),
  findUser: vi.fn(),
  findMembership: vi.fn(),
  findDiscipline: vi.fn(),
};

const client = {
  user: { findUnique: mocks.findUser },
  userSpaceMembership: { findMany: mocks.findMemberships, findUnique: mocks.findMembership },
  disciplinaryAction: { findFirst: mocks.findDiscipline },
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
    mocks.findUser.mockResolvedValue({ isSuperAdmin: false });
    mocks.findMembership.mockResolvedValue({ role: "Moderator" });
    mocks.findDiscipline.mockResolvedValue(null);
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

  it("removes suspended spaces from the query before loading content", async () => {
    mocks.findMemberships.mockResolvedValue([{ spaceId: "space-1", role: "EDITOR" }]);
    mocks.findDiscipline.mockResolvedValue({ kind: "suspension" });

    await expect(getSpacePosts("editor-1", {}, client)).resolves.toEqual({
      posts: [],
      nextCursor: undefined,
      hasNextPage: false,
    });
    expect(mocks.findPosts).not.toHaveBeenCalled();
  });

  it("does not expose moderation capabilities to a restricted moderator", async () => {
    mocks.findMemberships.mockResolvedValue([{ spaceId: "space-1", role: "MODERATOR" }]);
    mocks.findDiscipline.mockResolvedValue({ kind: "restriction" });

    const result = await getSpacePosts("moderator-1", {}, client);
    expect(result.posts[0]).toMatchObject({
      viewerRole: "READ_ONLY",
      viewerCanEdit: false,
      viewerCanDelete: false,
      viewerCanModerate: false,
    });
  });

  it("keeps a super-admin feed scoped to the selected space", async () => {
    mocks.findUser.mockResolvedValue({ isSuperAdmin: true });
    await getAllPosts("root-1", { spaceId: "space-1" }, client);
    expect(mocks.findPosts).toHaveBeenCalledWith(
      expect.objectContaining({ where: { spaceId: "space-1" } })
    );
  });
});
