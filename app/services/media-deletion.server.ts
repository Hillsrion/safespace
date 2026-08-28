import type { Prisma, PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import {
  getMediaStorage,
  type MediaStorage,
} from "~/services/media-storage.server";
import { deleteMediaObjectWithTimeout, mediaDeletionErrorCode } from "~/services/media-deletion-utils.server";
export { MediaDeletionTimeoutError, deleteMediaObjectWithTimeout, mediaDeletionErrorCode } from "~/services/media-deletion-utils.server";

type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type MediaDeletionResult = {
  deleted: number;
  failed: number;
};

type MediaDeletionRequestContext = {
  requestedByUserId: string;
  spaceId: string;
};

function uniqueStorageKeys(keys: readonly string[]): string[] {
  return [...new Set(keys.filter((key) => key.length > 0))];
}

const DEFAULT_STORAGE_DELETE_TIMEOUT_MS = 30_000;

function validatedStorageTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_STORAGE_DELETE_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new RangeError("Media deletion storage timeout must be between 1000 and 120000 milliseconds");
  }
  return timeoutMs;
}

/** Must be called before the SQL rows owning these keys are deleted. */
export async function enqueueMediaDeletionJobs(
  tx: TransactionClient,
  storageKeys: readonly string[],
  context: MediaDeletionRequestContext
): Promise<string[]> {
  const keys = uniqueStorageKeys(storageKeys);
  if (keys.length === 0) return [];
  await tx.mediaDeletionJob.createMany({
    data: keys.map((storageKey) => ({ storageKey, ...context })),
    skipDuplicates: true,
  });
  return keys;
}

export async function enqueueMediaDeletionForWhere(
  tx: TransactionClient,
  where: Prisma.MediaWhereInput,
  context: { requestedByUserId: string }
): Promise<string[]> {
  const rows = await tx.media.findMany({
    where,
    select: { storageKey: true, post: { select: { spaceId: true } } },
  });
  if (rows.length === 0) return [];
  await tx.mediaDeletionJob.createMany({
    data: rows.map(({ storageKey, post }) => ({
      storageKey,
      requestedByUserId: context.requestedByUserId,
      spaceId: post.spaceId,
    })),
    skipDuplicates: true,
  });
  return uniqueStorageKeys(rows.map(({ storageKey }) => storageKey));
}

/**
 * Attempts deletion immediately after commit. Failures remain in the outbox and
 * can be retried safely; R2 DELETE is idempotent.
 */
export async function processMediaDeletionJobs(
  storageKeys: readonly string[],
  options: { client?: PrismaClient; storage?: MediaStorage; storageTimeoutMs?: number } = {}
): Promise<MediaDeletionResult> {
  const keys = uniqueStorageKeys(storageKeys);
  if (keys.length === 0) return { deleted: 0, failed: 0 };
  const client = options.client ?? prisma;
  const storageTimeoutMs = validatedStorageTimeoutMs(options.storageTimeoutMs);
  const jobs = await client.mediaDeletionJob.findMany({
    where: { storageKey: { in: keys } },
    select: { id: true, storageKey: true },
  });
  if (jobs.length === 0) return { deleted: 0, failed: 0 };

  let storage: MediaStorage;
  try {
    storage = options.storage ?? getMediaStorage();
  } catch (error) {
    const lastError = mediaDeletionErrorCode(error);
    await client.mediaDeletionJob.updateMany({
      where: { id: { in: jobs.map(({ id }) => id) } },
      data: {
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        lastError,
      },
    });
    return { deleted: 0, failed: jobs.length };
  }

  let deleted = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await deleteMediaObjectWithTimeout(storage, job.storageKey, storageTimeoutMs);
      await client.mediaDeletionJob.deleteMany({ where: { id: job.id } });
      deleted += 1;
    } catch (error) {
      failed += 1;
      await client.mediaDeletionJob.updateMany({
        where: { id: job.id },
        data: {
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          lastError: mediaDeletionErrorCode(error),
        },
      });
    }
  }
  return { deleted, failed };
}

/** Entry point suitable for a scheduled retry worker. */
export async function processPendingMediaDeletionJobs(
  options: { client?: PrismaClient; limit?: number; storage?: MediaStorage; storageTimeoutMs?: number } = {}
): Promise<MediaDeletionResult> {
  const client = options.client ?? prisma;
  const limit = options.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Media deletion batch size must be between 1 and 100");
  }
  const jobs = await client.mediaDeletionJob.findMany({
    select: { storageKey: true },
    orderBy: [{ attempts: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
  return processMediaDeletionJobs(
    jobs.map(({ storageKey }) => storageKey),
    { client, storage: options.storage, storageTimeoutMs: options.storageTimeoutMs }
  );
}
