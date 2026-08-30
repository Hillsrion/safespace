import { describe, expect, it, vi } from "vitest";

vi.mock("../services/media-storage.server", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/media-storage.server")>();
  return { ...original, getMediaStorage: vi.fn() };
});

import { getMediaStorage } from "./media-storage.server";
import { main, processBatch, readBacklogStatus, wait, workerConfig, type WorkerConfig } from "../../server/media-deletion-worker";

const baseEnvironment = {
  MEDIA_DELETION_WORKER_DATABASE_URL: "postgresql://worker@localhost/safespace?schema=public",
};

describe("media deletion worker CLI boundary", () => {
  it("requires one explicit execution mode and a dedicated database URL", () => {
    expect(() => workerConfig(["node", "worker", "--once"], baseEnvironment)).not.toThrow();
    expect(() => workerConfig(["node", "worker"], baseEnvironment)).toThrow("usage");
    expect(() => workerConfig(["node", "worker", "--loop", "--once"], baseEnvironment)).toThrow("usage");
    expect(() => workerConfig(["node", "worker", "--once"], { ...baseEnvironment, DATABASE_URL: "postgresql://web@localhost/safespace" })).toThrow("must not receive");
    expect(() => workerConfig(["node", "worker", "--once"], { ...baseEnvironment, SESSION_SECRET: "session-secret" })).toThrow("must not receive");
    expect(() => workerConfig(["node", "worker", "--once"], { ...baseEnvironment, MEDIA_DELETION_WORKER_DATABASE_URL: "postgresql://worker@localhost/safespace?schema=public&schema=evil" })).toThrow("public-schema");
  });

  it("prints help without reading configuration or opening a database connection", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(main(["node", "worker", "--help"], {})).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("usage: media-deletion-worker --once|--loop");
    log.mockRestore();
  });

  it("claims sequentially and stops before leasing another job", async () => {
    const storage = { deleteObject: vi.fn(async () => undefined) };
    vi.mocked(getMediaStorage).mockReturnValue(storage as never);
    const calls: string[] = [];
    const client = { $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" "); calls.push(sql);
      if (sql.includes("claim_media")) return calls.filter((call) => call.includes("claim_media")).length === 1
        ? [{ job_id: "00000000-0000-4000-8000-000000000001", storage_key: "evidence/v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg", lease_token: "00000000-0000-4000-8000-000000000002" }]
        : [{ job_id: "00000000-0000-4000-8000-000000000003", storage_key: "evidence/v1/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.jpg", lease_token: "00000000-0000-4000-8000-000000000004" }];
      return [{ complete_media_deletion_job: true }];
    }) } as never;
    let checks = 0;
    const result = await processBatch(client, { ...workerConfig(["node", "worker", "--once"], baseEnvironment), batchSize: 2 }, () => ++checks > 1);
    expect(result).toEqual({ claimed: 1, deleted: 1, failed: 0 });
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("records failure without completing a failed deletion", async () => {
    vi.mocked(getMediaStorage).mockReturnValue({ deleteObject: vi.fn(async () => { throw new Error("no"); }) } as never);
    const calls: string[] = [];
    const client = { $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" "); calls.push(sql);
      if (sql.includes("claim_media")) return [{ job_id: "00000000-0000-4000-8000-000000000001", storage_key: "evidence/v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg", lease_token: "00000000-0000-4000-8000-000000000002" }];
      return [{ fail_media_deletion_job: true }];
    }) } as never;
    const config: WorkerConfig = { ...workerConfig(["node", "worker", "--once"], baseEnvironment), batchSize: 1 };
    await expect(processBatch(client, config, () => false)).resolves.toEqual({ claimed: 1, deleted: 0, failed: 1 });
    expect(calls.some((sql) => sql.includes("complete_media"))).toBe(false);
    expect(calls.some((sql) => sql.includes("fail_media"))).toBe(true);
  });

  it("settles waits immediately after stop and after an elapsed timeout", async () => {
    const stopped = new AbortController(); stopped.abort();
    await expect(wait(60_000, stopped.signal)).resolves.toBeUndefined();
    vi.useFakeTimers();
    const active = new AbortController();
    const removeListener = vi.spyOn(active.signal, "removeEventListener");
    const pending = wait(1_000, active.signal);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toBeUndefined();
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    active.abort();
    vi.useRealTimers();
  });

  it("maps aggregate backlog counters without exposing queued identifiers", async () => {
    const client = { $queryRaw: vi.fn(async () => [{
      pending_count: 8n,
      due_count: 3n,
      leased_count: 2n,
      oldest_age_seconds: 91n,
      max_attempts: 4,
    }]) } as never;
    await expect(readBacklogStatus(client)).resolves.toEqual({
      pending: 8,
      due: 3,
      leased: 2,
      oldestAgeSeconds: 91,
      maxAttempts: 4,
    });
  });
});
