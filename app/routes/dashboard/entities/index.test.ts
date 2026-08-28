import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  entities: vi.fn(),
  entityCount: vi.fn(),
  spaces: vi.fn(),
}));

vi.mock("../../../services/auth.server", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("../../../db/client.server", () => ({
  prisma: {
    reportedEntity: { count: mocks.entityCount, findMany: mocks.entities },
  },
}));
vi.mock("../../../db/repositories/spaces/queries.server", () => ({
  getUserSpaces: mocks.spaces,
}));

import { loader } from "./index";

describe("reported entity dashboard loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "member", isSuperAdmin: false });
    mocks.entities.mockResolvedValue([]);
    mocks.entityCount.mockResolvedValue(0);
    mocks.spaces.mockResolvedValue([]);
  });
  it("filters visible report summaries without selecting authors", async () => {
    mocks.currentUser.mockResolvedValue({ id: "member", isSuperAdmin: false });
    mocks.entities.mockResolvedValue([]);
    mocks.entityCount.mockResolvedValue(0);
    mocks.spaces.mockResolvedValue([]);

    await loader({
      request: new Request(
        "https://safe.test/dashboard/entities?severity=high&verification=verified"
      ),
      params: {},
      context: {},
    });

    const query = mocks.entities.mock.calls[0][0];
    expect(query.where).toEqual(expect.objectContaining({
      posts: { some: expect.objectContaining({ AND: expect.any(Array) }) },
    }));
    expect(query.select._count.select.posts.where).toEqual(
      expect.objectContaining({ AND: expect.any(Array) })
    );
    expect(query.select.posts.select).toEqual({
      createdAt: true,
      severity: true,
      verificationStatus: true,
    });
    expect(JSON.stringify(query)).not.toContain("author");
    expect(query.where.spaceId).toEqual({ in: [] });
    expect(query.select.posts.where.AND).toEqual([
      { status: "active", OR: [{ isAdminOnly: false }, { isAdminOnly: true, spaceId: { in: [] } }] },
      { severity: "high" }, { verificationStatus: "verified" },
    ]);
  });
  it("keeps elevated summaries inside currently accessible elevated spaces", async () => {
    mocks.spaces.mockResolvedValue([{ id: "readable", role: "READ_ONLY" }, { id: "moderated", role: "MODERATOR" }]);
    await loader({ request: new Request("https://safe.test/dashboard/entities"), params: {}, context: {} });
    const query = mocks.entities.mock.calls[0][0];
    expect(query.where.spaceId).toEqual({ in: ["readable", "moderated"] });
    expect(query.select.posts.where.AND[0].OR[1]).toEqual({ isAdminOnly: true, spaceId: { in: ["moderated"] } });
    expect(query.select._count.select.posts.where).toEqual(query.select.posts.where);
  });
  it("bounds paging and search and drops unsupported filter values", async () => {
    await loader({ request: new Request(`https://safe.test/dashboard/entities?page=99999&severity=private&verification=bogus&q=${"a".repeat(150)}`), params: {}, context: {} });
    const query = mocks.entities.mock.calls[0][0];
    expect(query).toMatchObject({ skip: 2475, take: 25 });
    expect(query.where.OR[0].name.contains).toHaveLength(100);
    expect(query.where.posts).toBeUndefined();
    expect(query.select.posts.where.AND).toHaveLength(1);
  });
  it("redirects unauthenticated visitors before any data query", async () => {
    mocks.currentUser.mockResolvedValue(null);
    await expect(loader({ request: new Request("https://safe.test/dashboard/entities"), params: {}, context: {} })).rejects.toMatchObject({ status: 302 });
    expect(mocks.entities).not.toHaveBeenCalled();
    expect(mocks.spaces).not.toHaveBeenCalled();
  });
});
