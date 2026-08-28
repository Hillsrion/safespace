import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs } from "react-router";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  deletePost: vi.fn(),
}));

vi.mock("../services/auth.server", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("../db/repositories/posts/queries.server", () => ({
  deletePost: mocks.deletePost,
}));

import { deletePostAction } from "./post-delete-action.server";

const POST_ID = "11111111-1111-4111-8111-111111111111";

function call(
  method: string,
  options: { origin?: string; id?: string } = {}
) {
  const headers = new Headers();
  if (options.origin !== undefined) headers.set("Origin", options.origin);
  return deletePostAction({
    request: new Request("https://safe.test/resources/api/posts/post/delete", {
      method,
      headers,
    }),
    params: { id: options.id ?? POST_ID },
  } as ActionFunctionArgs);
}

describe("post deletion endpoint action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "moderator" });
    mocks.deletePost.mockResolvedValue(undefined);
  });

  it.each(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH"])(
    "rejects %s before authentication or deletion",
    async (method) => {
      const response = await call(method);

      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("DELETE");
      expect(mocks.currentUser).not.toHaveBeenCalled();
      expect(mocks.deletePost).not.toHaveBeenCalled();
    }
  );

  it("rejects an unauthenticated DELETE without deletion", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await call("DELETE", { origin: "https://safe.test" });

    expect(response.status).toBe(401);
    expect(mocks.deletePost).not.toHaveBeenCalled();
  });

  it("rejects cross-origin DELETE before authentication or deletion", async () => {
    const response = await call("DELETE", { origin: "https://attacker.test" });

    expect(response.status).toBe(403);
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(mocks.deletePost).not.toHaveBeenCalled();
  });

  it("rejects an invalid post ID before deletion", async () => {
    const response = await call("DELETE", {
      origin: "https://safe.test",
      id: "not-a-uuid",
    });

    expect(response.status).toBe(400);
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(mocks.deletePost).not.toHaveBeenCalled();
  });

  it("deletes only through a same-origin authenticated DELETE", async () => {
    const response = await call("DELETE", { origin: "https://safe.test" });

    expect(response.status).toBe(200);
    expect(mocks.currentUser).toHaveBeenCalledTimes(1);
    expect(mocks.deletePost).toHaveBeenCalledWith(POST_ID, "moderator");
    await expect(response.json()).resolves.toEqual({ success: true, action: "deleted" });
  });
});
