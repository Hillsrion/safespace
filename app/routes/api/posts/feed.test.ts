import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoaderFunctionArgs } from "react-router";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  fullUser: vi.fn(),
  spacePosts: vi.fn(),
  allPosts: vi.fn(),
  track: vi.fn(),
}));
vi.mock("../../../services/auth.server", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("../../../services/space-activity-tracking.server", () => ({ trackVisitedSpace: mocks.track }));
vi.mock("../../../db/repositories/users.server", () => ({ getUserById: mocks.fullUser }));
vi.mock("../../../db/repositories/posts/queries.server", () => ({
  getSpacePosts: mocks.spacePosts,
  getAllPosts: mocks.allPosts,
}));

import { loader } from "./feed";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const CURSOR = "22222222-2222-4222-8222-222222222222";
const call = (query: string) => loader({
  request: new Request(`https://example.test/resources/api/posts/feed?${query}`),
} as LoaderFunctionArgs);

describe("space-scoped feed pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "actor" });
    mocks.fullUser.mockResolvedValue({ isSuperAdmin: false });
    mocks.spacePosts.mockResolvedValue({ posts: [], hasNextPage: false });
    mocks.allPosts.mockResolvedValue({ posts: [], hasNextPage: false });
  });

  it("preserves the selected space and cursor for member pagination", async () => {
    await call(`spaceId=${SPACE_ID}&cursor=${CURSOR}&limit=10`);
    expect(mocks.spacePosts).toHaveBeenCalledWith("actor", {
      spaceId: SPACE_ID, cursor: CURSOR, limit: 10,
    });
    expect(mocks.allPosts).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith("actor", SPACE_ID);
  });

  it("preserves the selected space for super-admin pagination", async () => {
    mocks.fullUser.mockResolvedValue({ isSuperAdmin: true });
    await call(`spaceId=${SPACE_ID}&limit=10`);
    expect(mocks.allPosts).toHaveBeenCalledWith("actor", {
      spaceId: SPACE_ID, cursor: undefined, limit: 10,
    });
  });

  it.each(["spaceId=invalid", "cursor=invalid", "limit=10garbage", "limit=1.5"])(
    "rejects malformed pagination before database queries: %s", async (query) => {
      await expect(call(query)).rejects.toMatchObject({ status: 400 });
      expect(mocks.spacePosts).not.toHaveBeenCalled();
      expect(mocks.allPosts).not.toHaveBeenCalled();
      expect(mocks.track).not.toHaveBeenCalled();
    }
  );
});
