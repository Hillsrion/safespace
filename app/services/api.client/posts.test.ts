import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const handleError = vi.hoisted(() => vi.fn());
vi.mock("../../lib/error/handle", () => ({ handleError }));
import { usePostActionsApi, usePostFeedApi } from "./posts";

describe("post action client contract", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());
  it("sends authenticated DELETE to the strict space-scoped post endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true, action: "deleted" })));
    const { result } = renderHook(() => usePostActionsApi());
    const postId = "11111111-1111-4111-8111-111111111111";
    await act(async () => {
      expect((await result.current.deletePost(postId, "space-id")).data?.success).toBe(true);
    });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/resources/api/spaces/space-id/posts/${postId}`, expect.objectContaining({ method: "DELETE", credentials: "include", body: undefined }));
  });

  it("keeps moderation and flag URLs rooted when called from a nested entity page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ success: true })));
    const { result } = renderHook(() => usePostActionsApi());
    await act(async () => {
      await result.current.updatePostStatus("post-id", "space-id", "hide");
      await result.current.flagPost("post-id", "space-id", "Reason");
    });
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls[0][0]).toBe("/resources/api/admin/spaces/space-id/posts/post-id/moderate");
    expect(calls[0][1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ action: "hide" });
    expect(calls[1][0]).toBe("/resources/api/spaces/space-id/posts/post-id/flag");
    for (const [url, options] of calls) {
      expect(new URL(String(url), "https://safe.test/dashboard/entities/entity-id").pathname).toBe(url);
      expect(options).toMatchObject({ credentials: "include" });
    }
    expect(calls[1][1]).toMatchObject({ method: "POST" });
  });

  it("uses an absolute scoped pagination URL even when the dashboard has a trailing slash", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ posts: [], hasNextPage: false })));
    const { result } = renderHook(() => usePostFeedApi());
    await act(async () => { await result.current.getPosts("cursor", 10, "space-id"); });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(new URL(String(url), "https://safe.test/dashboard/").pathname).toBe("/resources/api/posts/feed");
    expect(new URL(String(url), "https://safe.test").searchParams.get("spaceId")).toBe("space-id");
    expect(options).toMatchObject({ method: "GET", credentials: "include" });
  });

  it("lets the action UI own error messages instead of emitting duplicate server-message toasts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ error: "Server diagnostic", code: "forbidden:api" }, { status: 403 })));
    const { result } = renderHook(() => usePostActionsApi());
    await act(async () => {
      await result.current.deletePost("post-id", "space-id");
      await result.current.updatePostStatus("post-id", "space-id", "hide");
      await result.current.flagPost("post-id", "space-id");
    });
    expect(handleError).not.toHaveBeenCalled();
  });
});
