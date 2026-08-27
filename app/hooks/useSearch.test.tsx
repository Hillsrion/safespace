import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock("../services/api.client/search", () => ({
  useSearchApi: () => ({ search: mocks.search }),
}));

import { useSearch } from "./useSearch";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("useSearch request lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => vi.useRealTimers());

  it("ignores an older response after the query changes", async () => {
    const first = deferred<{ data: Array<{ type: string; data: { id: string } }> }>();
    const second = deferred<{ data: Array<{ type: string; data: { id: string } }> }>();
    mocks.search.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useSearch());

    act(() => result.current.setSearchTerm("first"));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    act(() => result.current.setSearchTerm("second"));
    await act(async () => vi.advanceTimersByTimeAsync(300));

    await act(async () => second.resolve({ data: [{ type: "post", data: { id: "new" } }] }));
    await act(async () => first.resolve({ data: [{ type: "post", data: { id: "old" } }] }));

    expect(result.current.results).toEqual([{ type: "post", data: { id: "new" } }]);
  });

  it("invalidates an in-flight response when the dialog resets", async () => {
    const pending = deferred<{ data: Array<{ type: string; data: { id: string } }> }>();
    mocks.search.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useSearch());

    act(() => result.current.setSearchTerm("private"));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    act(() => result.current.resetSearch());
    await act(async () => pending.resolve({ data: [{ type: "post", data: { id: "stale" } }] }));

    expect(result.current.searchTerm).toBe("");
    expect(result.current.results).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
