import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listReportedEntitiesForMember: vi.fn(),
  getReportedEntityForMember: vi.fn(),
}));

vi.mock("./auth.server", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("./reported-entity-member.server", () => ({
  listReportedEntitiesForMember: mocks.listReportedEntitiesForMember,
  getReportedEntityForMember: mocks.getReportedEntityForMember,
}));

import {
  reportedEntityMemberCollectionLoader,
  reportedEntityMemberItemLoader,
} from "./reported-entity-member-actions.server";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

function request(path: string, method = "GET") {
  return new Request(`https://safe.test${path}`, { method });
}

describe("reported entity member HTTP boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: USER_ID, isSuperAdmin: false });
    mocks.listReportedEntitiesForMember.mockResolvedValue({
      entities: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
    mocks.getReportedEntityForMember.mockResolvedValue({
      entity: { id: ENTITY_ID },
      posts: [],
      page: 1,
      limit: 20,
      totalPosts: 0,
      totalPages: 0,
    });
  });

  it("accepts GET only on both resources", async () => {
    const collection = await reportedEntityMemberCollectionLoader({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/reported-entities`,
        "POST"
      ),
      params: { spaceId: SPACE_ID },
      context: {},
    });
    const item = await reportedEntityMemberItemLoader({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/reported-entities/${ENTITY_ID}`,
        "PATCH"
      ),
      params: { spaceId: SPACE_ID, entityId: ENTITY_ID },
      context: {},
    });

    expect(collection.status).toBe(405);
    expect(item.status).toBe(405);
    expect(collection.headers.get("Allow")).toBe("GET");
    expect(item.headers.get("Allow")).toBe("GET");
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.listReportedEntitiesForMember).not.toHaveBeenCalled();
    expect(mocks.getReportedEntityForMember).not.toHaveBeenCalled();
  });

  it("requires authentication before member reads", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await reportedEntityMemberCollectionLoader({
      request: request(`/resources/api/spaces/${SPACE_ID}/reported-entities`),
      params: { spaceId: SPACE_ID },
      context: {},
    });

    expect(response.status).toBe(401);
    expect(mocks.listReportedEntitiesForMember).not.toHaveBeenCalled();
  });

  it("rejects malformed paths, unknown, duplicate and out-of-range queries", async () => {
    const invalidPath = await reportedEntityMemberItemLoader({
      request: request(
        `/resources/api/spaces/invalid/reported-entities/${ENTITY_ID}`
      ),
      params: { spaceId: "invalid", entityId: ENTITY_ID },
      context: {},
    });
    const unknown = await reportedEntityMemberCollectionLoader({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/reported-entities?internal=true`
      ),
      params: { spaceId: SPACE_ID },
      context: {},
    });
    const duplicate = await reportedEntityMemberCollectionLoader({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/reported-entities?limit=10&limit=20`
      ),
      params: { spaceId: SPACE_ID },
      context: {},
    });
    const unbounded = await reportedEntityMemberItemLoader({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/reported-entities/${ENTITY_ID}?page=1001&limit=101`
      ),
      params: { spaceId: SPACE_ID, entityId: ENTITY_ID },
      context: {},
    });

    expect(invalidPath.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(duplicate.status).toBe(400);
    expect(unbounded.status).toBe(400);
    expect(mocks.listReportedEntitiesForMember).not.toHaveBeenCalled();
    expect(mocks.getReportedEntityForMember).not.toHaveBeenCalled();
  });

  it("passes normalized, bounded collection paging to the scoped service", async () => {
    const response = await reportedEntityMemberCollectionLoader({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/reported-entities?page=2&limit=25`
      ),
      params: { spaceId: SPACE_ID },
      context: {},
    });

    expect(response.status).toBe(200);
    expect(mocks.listReportedEntitiesForMember).toHaveBeenCalledWith(
      USER_ID,
      SPACE_ID,
      { page: 2, limit: 25 }
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      entities: [],
      page: 1,
      limit: 20,
    });
  });

  it("passes the exact space and entity scopes with safe paging defaults", async () => {
    const response = await reportedEntityMemberItemLoader({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/reported-entities/${ENTITY_ID}`
      ),
      params: { spaceId: SPACE_ID, entityId: ENTITY_ID },
      context: {},
    });

    expect(response.status).toBe(200);
    expect(mocks.getReportedEntityForMember).toHaveBeenCalledWith(
      USER_ID,
      SPACE_ID,
      ENTITY_ID,
      { page: 1, limit: 20 }
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      entity: { id: ENTITY_ID },
      posts: [],
    });
  });
});
