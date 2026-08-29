import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  updatePostStatus: vi.fn(),
}));
vi.mock("./auth.server", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("../db/repositories/posts/queries.server", () => ({
  updatePostStatus: mocks.updatePostStatus,
}));

import { moderateSpacePostAction } from "./post-moderation-action.server";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const POST_ID = "22222222-2222-4222-8222-222222222222";

function call(method: string, body?: unknown, params = { spaceId: SPACE_ID, postId: POST_ID }) {
  return moderateSpacePostAction({
    request: new Request(
      `https://safe.test/resources/api/admin/spaces/${SPACE_ID}/posts/${POST_ID}/moderate`,
      {
        method,
        headers: {
          Origin: "https://safe.test",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }
    ),
    params,
    context: {},
  });
}

describe("space-scoped post moderation action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "moderator" });
    mocks.updatePostStatus.mockResolvedValue({ id: POST_ID });
  });

  it("passes the path space as a non-enumerating repository guard", async () => {
    const response = await call("PUT", {
      action: "hide",
      reason: "Contenu à examiner",
    });
    expect(response.status).toBe(200);
    expect(mocks.updatePostStatus).toHaveBeenCalledWith(
      POST_ID,
      "hidden",
      "moderator",
      expect.anything(),
      { expectedSpaceId: SPACE_ID, reason: "Contenu à examiner" }
    );
  });

  it("rejects method, origin, path and mass assignment before mutation", async () => {
    expect((await call("POST", { action: "hide" })).status).toBe(405);

    const crossOrigin = await moderateSpacePostAction({
      request: new Request("https://safe.test/moderate", {
        method: "PUT",
        headers: { Origin: "https://evil.test", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hide" }),
      }),
      params: { spaceId: SPACE_ID, postId: POST_ID },
      context: {},
    });
    expect(crossOrigin.status).toBe(403);
    expect((await call("PUT", { action: "hide" }, { spaceId: "bad", postId: POST_ID })).status).toBe(400);
    expect((await call("PUT", { action: "hide", status: "active" })).status).toBe(400);
    expect(mocks.updatePostStatus).not.toHaveBeenCalled();
  });

  it("requires authentication and a strict supported action", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await call("PUT", { action: "hide" })).status).toBe(401);
    expect((await call("PUT", { action: "delete" })).status).toBe(400);
    expect(mocks.updatePostStatus).not.toHaveBeenCalled();
  });
});
