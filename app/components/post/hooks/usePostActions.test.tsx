import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deletePost: vi.fn(),
  updatePostStatus: vi.fn(),
  flagPost: vi.fn(),
  removePost: vi.fn(),
  updateStoreStatus: vi.fn(),
  revalidate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("react-router", () => ({
  useRevalidator: () => ({ revalidate: mocks.revalidate }),
}));
vi.mock("../../../hooks/use-toast", () => ({ toast: mocks.toast }));
vi.mock("../../../stores/postStore", () => ({
  usePostStore: () => ({
    removePost: mocks.removePost,
    updatePostStatus: mocks.updateStoreStatus,
  }),
}));
vi.mock("../../../services/api.client/posts", () => ({
  usePostActionsApi: () => ({
    deletePost: mocks.deletePost,
    updatePostStatus: mocks.updatePostStatus,
    flagPost: mocks.flagPost,
  }),
}));

import { usePostActions } from "./usePostActions";

describe("usePostActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deletePost.mockResolvedValue({ data: { success: true }, error: null });
    mocks.updatePostStatus.mockResolvedValue({ data: { success: true }, error: null });
    mocks.flagPost.mockResolvedValue({ data: { success: true }, error: null });
    mocks.revalidate.mockResolvedValue(undefined);
  });

  it.each(["delete", "hide", "unhide"] as const)(
    "revalidates loader data only after a successful %s mutation",
    async (action) => {
      const { result } = renderHook(() =>
        usePostActions({ postId: "post-1", spaceId: "space-1" })
      );

      await act(async () => {
        await expect(result.current.handlePostAction(action)).resolves.toEqual({
          success: true,
        });
      });

      expect(mocks.revalidate).toHaveBeenCalledOnce();
      if (action === "delete") {
        expect(mocks.deletePost).toHaveBeenCalledWith("post-1", "space-1");
        expect(mocks.removePost).toHaveBeenCalledWith("post-1");
      } else {
        expect(mocks.updatePostStatus).toHaveBeenCalledWith(
          "post-1",
          "space-1",
          action
        );
        expect(mocks.updateStoreStatus).toHaveBeenCalledWith(
          "post-1",
          action === "hide" ? "hidden" : "published"
        );
      }
      expect(result.current.isSubmitting).toBe(false);
    }
  );

  it("does not revalidate or reveal a backend error after an unsuccessful mutation", async () => {
    mocks.deletePost.mockResolvedValue({
      data: null,
      error: { message: "raw database hostname and post contents" },
    });
    const { result } = renderHook(() => usePostActions({ postId: "post-1", spaceId: "space-1" }));

    await act(async () => {
      await expect(result.current.handlePostAction("delete")).resolves.toEqual({
        success: false,
        error: "Impossible de terminer cette action",
      });
    });

    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.removePost).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Impossible de terminer cette action" })
    );
    expect(JSON.stringify(mocks.toast.mock.calls)).not.toContain("raw database");
    expect(result.current.isSubmitting).toBe(false);
  });

  it("recovers from a rejected network mutation without revalidation", async () => {
    mocks.updatePostStatus.mockRejectedValue(new TypeError("private network detail"));
    const { result } = renderHook(() => usePostActions({ postId: "post-1", spaceId: "space-1" }));

    await act(async () => {
      await expect(result.current.handlePostAction("hide")).resolves.toEqual({
        success: false,
        error: "Impossible de terminer cette action",
      });
    });

    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);
  });

  it("keeps a committed mutation successful when revalidation throws", async () => {
    mocks.revalidate.mockImplementationOnce(() => {
      throw new Error("private loader diagnostic");
    });
    const { result } = renderHook(() => usePostActions({ postId: "post-1", spaceId: "space-1" }));

    await act(async () => {
      await expect(result.current.handlePostAction("delete")).resolves.toEqual({
        success: true,
      });
    });

    expect(mocks.removePost).toHaveBeenCalledWith("post-1");
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Action enregistrée",
      description: "Action enregistrée, actualisez la page si nécessaire.",
    });
    expect(JSON.stringify(mocks.toast.mock.calls)).not.toContain("private loader");
    expect(result.current.isSubmitting).toBe(false);
  });

  it("rejects a second action started in the same render while the first is pending", async () => {
    let resolveDelete: ((value: { data: { success: boolean }; error: null }) => void) | undefined;
    mocks.deletePost.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        })
    );
    const { result } = renderHook(() => usePostActions({ postId: "post-1", spaceId: "space-1" }));

    let first: Promise<unknown>;
    let second: Promise<unknown>;
    act(() => {
      first = result.current.handlePostAction("delete");
      second = result.current.handlePostAction("hide");
    });

    await expect(second!).resolves.toEqual({
      success: false,
      error: "Une action est déjà en cours",
    });
    expect(mocks.updatePostStatus).not.toHaveBeenCalled();

    await act(async () => {
      resolveDelete?.({ data: { success: true }, error: null });
      await first!;
    });
    expect(result.current.isSubmitting).toBe(false);
  });

  it("keeps buttons busy through a slow refresh and preserves committed success if it rejects", async () => {
    let rejectRefresh!: (reason: Error) => void;
    mocks.revalidate.mockReturnValueOnce(new Promise((_, reject) => { rejectRefresh = reject; }));
    const { result } = renderHook(() => usePostActions({ postId: "post-1", spaceId: "space-1" }));
    let completion!: Promise<unknown>;
    act(() => { completion = result.current.handlePostAction("hide"); });
    await waitFor(() => expect(mocks.revalidate).toHaveBeenCalledOnce());
    expect(result.current.isSubmitting).toBe(true);
    await act(async () => {
      rejectRefresh(new Error("Private refresh diagnostic"));
      await expect(completion).resolves.toEqual({ success: true });
    });
    expect(result.current.isSubmitting).toBe(false);
    expect(mocks.updatePostStatus).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.toast.mock.calls)).not.toContain("Private refresh");
  });

  it("unlocks flagging after a rejected request without displaying its diagnostic", async () => {
    mocks.flagPost.mockRejectedValueOnce(new Error("Private flag failure"));
    const { result } = renderHook(() => usePostActions({ postId: "post-1", spaceId: "space-1" }));
    await act(async () => {
      await expect(result.current.handleFlagPost("reason")).resolves.toEqual({ success: false, error: "Impossible de signaler ce rapport" });
    });
    expect(result.current.isSubmitting).toBe(false);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.toast.mock.calls)).not.toContain("Private flag");
  });
});
