import { describe, expect, it, vi } from "vitest";
import { MediaStorageConfigurationError, type MediaStorage } from "./media-storage.server";
import {
  deleteMediaObjectWithTimeout,
  mediaDeletionErrorCode,
  MediaDeletionTimeoutError,
} from "./media-deletion.server";

describe("media deletion failure boundary", () => {
  it("persists only a fixed error code category", () => {
    expect(mediaDeletionErrorCode(new MediaStorageConfigurationError("secret endpoint https://example.invalid/key")))
      .toBe("storage_configuration");
    expect(mediaDeletionErrorCode(new MediaDeletionTimeoutError())).toBe("storage_timeout");
    expect(mediaDeletionErrorCode(new Error("provider response containing a storage key"))).toBe("storage_request_failed");
  });

  it("applies the configured deletion deadline", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const storage = { deleteObject: vi.fn((_key: string, options?: { signal?: AbortSignal }) => {
      signal = options?.signal;
      return new Promise<void>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    }) } as unknown as MediaStorage;
    const deletion = deleteMediaObjectWithTimeout(storage, "evidence/v1/not-a-real-key.jpg", 1_000);
    const expectation = expect(deletion).rejects.toBeInstanceOf(MediaDeletionTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
    expect(signal?.aborted).toBe(true);
    vi.useRealTimers();
  });
});
