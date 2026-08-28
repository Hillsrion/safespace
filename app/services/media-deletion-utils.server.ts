import { MediaStorageConfigurationError, type MediaStorage } from "~/services/media-storage.server";

export class MediaDeletionTimeoutError extends Error {}

export function mediaDeletionErrorCode(error: unknown): "storage_configuration" | "storage_timeout" | "storage_request_failed" {
  if (error instanceof MediaStorageConfigurationError) return "storage_configuration";
  if (error instanceof MediaDeletionTimeoutError) return "storage_timeout";
  return "storage_request_failed";
}

export async function deleteMediaObjectWithTimeout(storage: MediaStorage, storageKey: string, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  try {
    await storage.deleteObject(storageKey, { signal: controller.signal });
    if (controller.signal.aborted) throw new MediaDeletionTimeoutError();
  } catch (error) {
    if (controller.signal.aborted) throw new MediaDeletionTimeoutError();
    throw error;
  } finally { clearTimeout(timeout); }
}
