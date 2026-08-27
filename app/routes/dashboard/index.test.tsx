import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  fullUser: vi.fn(),
  spaces: vi.fn(),
  spacePosts: vi.fn(),
  allPosts: vi.fn(),
  loaderData: vi.fn(),
  paginate: vi.fn(),
  inView: false,
}));
vi.mock("react-router", async () => ({
  ...await vi.importActual("react-router"),
  useLoaderData: mocks.loaderData,
}));
vi.mock("../../services/auth.server", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("../../services/session.server", () => ({ getSession: async () => ({ get: () => null }) }));
vi.mock("../../db/repositories/users.server", () => ({ getUserById: mocks.fullUser }));
vi.mock("../../db/repositories/spaces/queries.server", () => ({ getUserSpaces: mocks.spaces }));
vi.mock("../../db/repositories/posts/queries.server", () => ({
  getSpacePosts: mocks.spacePosts,
  getAllPosts: mocks.allPosts,
}));
vi.mock("../../components/post", () => ({ Post: () => null }));
vi.mock("../../hooks/use-toast-trigger", () => ({ useToastTrigger: () => undefined }));
vi.mock("../../hooks/useUser", () => ({ useUser: () => ({ id: "actor", role: "EDITOR", isSuperAdmin: false }) }));
vi.mock("../../services/api.client/posts", () => ({
  usePostFeedApi: () => ({ getPosts: mocks.paginate, isLoading: false }),
}));
vi.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: undefined, inView: mocks.inView }),
}));

import Dashboard, { loader } from "./index";
import { usePostStore } from "../../stores/postStore";

const SPACE_A = "11111111-1111-4111-8111-111111111111";
const SPACE_B = "22222222-2222-4222-8222-222222222222";
const load = (query = "", cookie = SPACE_A) => loader({
  request: new Request(`https://example.test/dashboard${query}`, {
    headers: { Cookie: `safespace_last_visited_space=${cookie}` },
  }),
});
const feed = (spaceId: string, posts: Array<{ id: string }>, hasNextPage = false) => ({
  initialPosts: posts,
  initialNextCursor: hasNextPage ? "cursor" : undefined,
  initialHasNextPage: hasNextPage,
  selectedSpaceId: spaceId,
  selectedSpaceName: spaceId,
  toastData: null,
});

describe("dashboard space entry and transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inView = false;
    mocks.currentUser.mockResolvedValue({ id: "actor" });
    mocks.fullUser.mockResolvedValue({ isSuperAdmin: false });
    mocks.spaces.mockResolvedValue([{ id: SPACE_A, name: "A" }, { id: SPACE_B, name: "B" }]);
    mocks.spacePosts.mockResolvedValue({ posts: [], hasNextPage: false });
    mocks.allPosts.mockResolvedValue({ posts: [], hasNextPage: false });
    usePostStore.getState().setPosts([]);
  });
  afterEach(cleanup);

  it("opens the last accessible space's feed without redirecting to administration", async () => {
    const result = await load();
    expect(result.data.selectedSpaceId).toBe(SPACE_A);
    expect(mocks.spacePosts).toHaveBeenCalledWith("actor", expect.objectContaining({ spaceId: SPACE_A }));
  });

  it("lets explicit selection override the previous space and lets users view all spaces", async () => {
    expect((await load(`?spaceId=${SPACE_B}`)).data.selectedSpaceId).toBe(SPACE_B);
    expect((await load("?spaceId=all")).data.selectedSpaceId).toBeUndefined();
  });

  it("clears inaccessible preferences and refuses explicit inaccessible spaces", async () => {
    mocks.spaces.mockResolvedValue([]);
    const result = await load();
    expect(result.data.selectedSpaceId).toBeUndefined();
    expect(new Headers(result.init?.headers).get("Set-Cookie")).toContain("Max-Age=0");
    await expect(load(`?spaceId=${SPACE_A}`)).rejects.toMatchObject({ status: 404 });
  });

  it("clears old posts when navigating into an empty space", async () => {
    mocks.loaderData.mockReturnValue(feed(SPACE_A, [{ id: "old-post" }]));
    const view = render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(usePostStore.getState().posts).toHaveLength(1));

    mocks.loaderData.mockReturnValue(feed(SPACE_B, []));
    view.rerender(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(usePostStore.getState().posts).toHaveLength(0));
  });

  it("ignores late pagination results from the previously selected space", async () => {
    mocks.inView = true;
    let resolvePage!: (value: unknown) => void;
    mocks.paginate.mockReturnValue(new Promise(resolve => { resolvePage = resolve; }));
    mocks.loaderData.mockReturnValue(feed(SPACE_A, [{ id: "old-post" }], true));
    const view = render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(mocks.paginate).toHaveBeenCalled());

    mocks.loaderData.mockReturnValue(feed(SPACE_B, []));
    view.rerender(<MemoryRouter><Dashboard /></MemoryRouter>);
    await act(async () => {
      resolvePage({ data: { posts: [{ id: "late-old-post" }], hasNextPage: false }, error: null });
    });
    expect(usePostStore.getState().posts).toEqual([]);
  });
});
