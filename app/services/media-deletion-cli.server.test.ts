// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), disconnect: vi.fn(), storage: vi.fn() }));
vi.mock("../generated/prisma", () => ({ PrismaClient: class { $queryRaw = mocks.query; $disconnect = mocks.disconnect; } }));
vi.mock("./media-storage.server", async (original) => ({ ...await original<typeof import("./media-storage.server")>(), getMediaStorage: mocks.storage }));
import { main } from "../../server/media-deletion-worker";

const environment = { MEDIA_DELETION_WORKER_DATABASE_URL: "postgresql://safespace_media_deletion_worker@localhost/test", MEDIA_DELETION_WORKER_BATCH_SIZE: "1", MEDIA_DELETION_WORKER_CADENCE_MS: "1000" };
const role = { name: "safespace_media_deletion_worker", inheritedRoles: 0n, owner: false, privateUsage: false, publicDataAccess: false, publicCreate: false, workerCreate: false, rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolinherit: false };
const job = { job_id: "00000000-0000-4000-8000-000000000001", lease_token: "00000000-0000-4000-8000-000000000002", storage_key: "private-key-not-to-log" };
const backlog = { pending_count: 0n, due_count: 0n, leased_count: 0n, oldest_age_seconds: 0n, max_attempts: 0 };
let previousExitCode: typeof process.exitCode;
beforeEach(() => {
  vi.clearAllMocks(); previousExitCode = process.exitCode; process.exitCode = undefined;
  mocks.disconnect.mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => { process.exitCode = previousExitCode; vi.useRealTimers(); vi.restoreAllMocks(); });
describe("built worker lifecycle logic", () => {
  it("exits unsuccessfully on failed deletion, cleans handlers, and never logs object details", async () => {
    const term = process.listenerCount("SIGTERM"), interrupt = process.listenerCount("SIGINT");
    mocks.query.mockResolvedValueOnce([role]).mockResolvedValueOnce([job]).mockResolvedValueOnce([{ fail_media_deletion_job: true }]).mockResolvedValueOnce([backlog]);
    mocks.storage.mockReturnValue({ deleteObject: vi.fn().mockRejectedValue(new Error("private-provider-secret")) });
    await main(["node", "worker", "--once"], environment);
    expect(process.exitCode).toBe(1);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(process.listenerCount("SIGTERM")).toBe(term);
    expect(process.listenerCount("SIGINT")).toBe(interrupt);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toMatch(/private-key|private-provider/);
    expect(vi.mocked(console.log).mock.calls[0][0]).toContain('"failed":1');
  });
  it("does not report success when SQL lease completion is fenced out", async () => {
    mocks.query.mockResolvedValueOnce([role]).mockResolvedValueOnce([job]).mockResolvedValueOnce([{ complete_media_deletion_job: false }]).mockResolvedValueOnce([backlog]);
    mocks.storage.mockReturnValue({ deleteObject: vi.fn().mockResolvedValue(undefined) });
    await main(["node", "worker", "--once"], environment);
    expect(process.exitCode).toBe(1);
    expect(vi.mocked(console.log).mock.calls[0][0]).toContain('"deleted":0');
  });
  it("polls again after the cadence and stops promptly without another claim", async () => {
    vi.useFakeTimers();
    const existing = process.listeners("SIGTERM");
    mocks.query.mockResolvedValueOnce([role]).mockImplementation(async (strings: TemplateStringsArray) => strings.join(" ").includes("media_deletion_backlog_status") ? [backlog] : []);
    mocks.storage.mockReturnValue({ deleteObject: vi.fn() });
    const running = main(["node", "worker", "--loop"], environment);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.query).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.query).toHaveBeenCalledTimes(5);
    const stop = process.listeners("SIGTERM").find((handler) => !existing.includes(handler));
    expect(stop).toBeDefined(); stop!("SIGTERM");
    await running;
    expect(mocks.query).toHaveBeenCalledTimes(5);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(process.listeners("SIGTERM")).toEqual(existing);
    expect(vi.getTimerCount()).toBe(0);
  });
});
