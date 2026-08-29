import type { PrismaClient } from "~/generated/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getReportedEntityForMemberById,
  getReportedEntityForMember,
  listReportedEntitiesForMember,
} from "./reported-entity-member.server";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const POST_ID = "44444444-4444-4444-8444-444444444444";
const HANDLE_ID = "55555555-5555-4555-8555-555555555555";

const client = {
  user: { findUnique: vi.fn() },
  userSpaceMembership: { findUnique: vi.fn() },
  disciplinaryAction: { findFirst: vi.fn() },
  reportedEntity: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
  },
  post: { findMany: vi.fn() },
} as unknown as PrismaClient;

const entity = {
  id: ENTITY_ID,
  spaceId: SPACE_ID,
  name: "Entité test",
  createdAt: new Date("2026-08-20T10:00:00.000Z"),
  updatedAt: new Date("2026-08-21T10:00:00.000Z"),
  addedByUserId: "private-adder",
  handles: [
    {
      id: HANDLE_ID,
      handle: "safe.handle",
      platform: "Instagram",
      reviewStatus: "questionable",
      reviewNote: "Private review note",
      reviewedByUserId: "private-reviewer",
    },
  ],
  _count: { posts: 2 },
};

const anonymousPost = {
  id: POST_ID,
  spaceId: SPACE_ID,
  authorId: USER_ID,
  reportedEntityId: ENTITY_ID,
  description: "Confidentiel",
  isAnonymous: true,
  isAdminOnly: false,
  status: "active",
  severity: "high",
  verificationStatus: "pending",
  requiresSensitiveReview: false,
  contentRevision: 1,
  createdAt: new Date("2026-08-22T10:00:00.000Z"),
  updatedAt: new Date("2026-08-22T10:00:00.000Z"),
  author: {
    id: USER_ID,
    firstName: "Identité",
    lastName: "Secrète",
    instagram: "private.author",
  },
  space: { id: SPACE_ID, name: "Espace" },
  reportedEntity: {
    id: ENTITY_ID,
    name: "Entité test",
    handles: [{ id: HANDLE_ID, handle: "safe.handle", platform: "Instagram" }],
  },
  media: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      storageKey: "private/storage/key",
      uploaderId: USER_ID,
      sha256: "private-sha",
      mimeType: "image/jpeg",
      fileSize: 42,
      metadataStripped: true,
      isBlurred: true,
      evidenceCategory: "photo",
      caption: null,
      sortOrder: 0,
      createdAt: new Date("2026-08-22T10:00:00.000Z"),
    },
  ],
};

describe("reported entity member read service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.user.findUnique).mockResolvedValue({
      isSuperAdmin: false,
    } as never);
    vi.mocked(client.userSpaceMembership.findUnique).mockResolvedValue({
      role: "EDITOR",
    } as never);
    vi.mocked(client.disciplinaryAction.findFirst).mockResolvedValue(null);
    vi.mocked(client.reportedEntity.findMany).mockResolvedValue([entity] as never);
    vi.mocked(client.reportedEntity.count).mockResolvedValue(1);
    vi.mocked(client.reportedEntity.findFirst).mockResolvedValue(entity as never);
    vi.mocked(client.post.findMany).mockResolvedValue([anonymousPost] as never);
  });

  it("scopes and bounds the list while counting only member-visible reports", async () => {
    const result = await listReportedEntitiesForMember(
      USER_ID,
      SPACE_ID,
      { page: 2, limit: 10 },
      client
    );

    expect(client.reportedEntity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { spaceId: SPACE_ID },
        skip: 10,
        take: 10,
      })
    );
    const query = vi.mocked(client.reportedEntity.findMany).mock.calls[0][0];
    expect(query.select?.handles).toEqual({
      select: { id: true, handle: true, platform: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(query.select?._count).toEqual({
      select: {
        posts: {
          where: {
            spaceId: SPACE_ID,
            OR: [
              { status: "active", isAdminOnly: false },
              { authorId: USER_ID },
            ],
          },
        },
      },
    });
    expect(result).toMatchObject({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
      entities: [
        {
          id: ENTITY_ID,
          spaceId: SPACE_ID,
          postCount: 2,
          handles: [
            { id: HANDLE_ID, handle: "safe.handle", platform: "Instagram" },
          ],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /reviewStatus|reviewNote|reviewedBy|private-adder|Private review note/
    );
  });

  it("rejects a suspended member before querying any entity", async () => {
    vi.mocked(client.disciplinaryAction.findFirst).mockResolvedValue({
      kind: "suspension",
    } as never);

    await expect(
      listReportedEntitiesForMember(
        USER_ID,
        SPACE_ID,
        { page: 1, limit: 20 },
        client
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(client.reportedEntity.findMany).not.toHaveBeenCalled();
    expect(client.reportedEntity.count).not.toHaveBeenCalled();
  });

  it("returns only explicitly scoped visible posts and fully redacts anonymity", async () => {
    const result = await getReportedEntityForMember(
      USER_ID,
      SPACE_ID,
      ENTITY_ID,
      { page: 1, limit: 5 },
      client
    );

    expect(client.reportedEntity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ENTITY_ID, spaceId: SPACE_ID } })
    );
    expect(client.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          reportedEntityId: ENTITY_ID,
          spaceId: SPACE_ID,
          OR: [
            { status: "active", isAdminOnly: false },
            { authorId: USER_ID },
          ],
        },
        skip: 0,
        take: 5,
      })
    );
    const postQuery = vi.mocked(client.post.findMany).mock.calls[0][0];
    expect(postQuery.include?.reportedEntity).toEqual({
      select: {
        id: true,
        name: true,
        handles: { select: { id: true, handle: true, platform: true } },
      },
    });
    expect(result).toMatchObject({
      totalPosts: 2,
      totalPages: 1,
      entity: { id: ENTITY_ID, postCount: 2 },
      posts: [
        {
          id: POST_ID,
          authorId: null,
          author: { id: "anonymous", instagram: null },
          viewerRole: "EDITOR",
          viewerCanEdit: true,
        },
      ],
    });
    expect(result.posts[0].media[0]).toMatchObject({
      id: "66666666-6666-4666-8666-666666666666",
      url: "/resources/api/media/66666666-6666-4666-8666-666666666666",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /Identité|Secrète|private\.author|private\/storage|private-sha|reviewNote/
    );
  });

  it("lets elevated viewers count and read every state, still inside the space", async () => {
    vi.mocked(client.userSpaceMembership.findUnique).mockResolvedValue({
      role: "MODERATOR",
    } as never);

    await getReportedEntityForMember(
      USER_ID,
      SPACE_ID,
      ENTITY_ID,
      { page: 1, limit: 20 },
      client
    );

    const entityQuery = vi.mocked(client.reportedEntity.findFirst).mock.calls[0][0];
    expect(entityQuery.select?._count).toEqual({
      select: {
        posts: {
          where: { reportedEntityId: ENTITY_ID, spaceId: SPACE_ID },
        },
      },
    });
    expect(client.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reportedEntityId: ENTITY_ID, spaceId: SPACE_ID },
      })
    );
  });

  it("does not query posts when the entity belongs to another space", async () => {
    vi.mocked(client.reportedEntity.findFirst).mockResolvedValue(null);

    await expect(
      getReportedEntityForMember(
        USER_ID,
        SPACE_ID,
        ENTITY_ID,
        { page: 1, limit: 20 },
        client
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(client.post.findMany).not.toHaveBeenCalled();
  });

  it("resolves the server-owned space before using the scoped paginated read", async () => {
    vi.mocked(client.reportedEntity.findFirst)
      .mockResolvedValueOnce({ spaceId: SPACE_ID } as never)
      .mockResolvedValueOnce(entity as never);

    const result = await getReportedEntityForMemberById(
      USER_ID,
      ENTITY_ID,
      { page: 2, limit: 10 },
      client
    );

    expect(client.reportedEntity.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: ENTITY_ID },
      select: { spaceId: true },
    });
    expect(client.reportedEntity.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: ENTITY_ID, spaceId: SPACE_ID } })
    );
    expect(client.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
    expect(result.entity.spaceId).toBe(SPACE_ID);
  });
});
