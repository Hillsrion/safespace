import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ record: vi.fn(), log: vi.fn() }));
vi.mock("./member-space-activity.server", () => ({ recordMemberSpaceActivity: mocks.record }));
vi.mock("../lib/error/server-error.server", () => ({ logServerException: mocks.log }));
import { trackVisitedSpace } from "./space-activity-tracking.server";

describe("daily space activity integration", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.record.mockResolvedValue(undefined); });
  it("does not turn a global feed into activity across every membership", async () => {
    await trackVisitedSpace("actor", undefined);
    expect(mocks.record).not.toHaveBeenCalled();
    await trackVisitedSpace("actor", "selected-space");
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith("actor", "selected-space");
  });
  it("keeps the feed available if recording fails with content-free operational context", async () => {
    const error = new Error("private database diagnostic");
    mocks.record.mockRejectedValue(error);
    await expect(trackVisitedSpace("private-user", "private-space")).resolves.toBeUndefined();
    expect(mocks.log).toHaveBeenCalledWith(error, { operation: "activity.record", errorCode: "server_error:api", httpStatus: 500 });
    expect(JSON.stringify(mocks.log.mock.calls[0][1])).not.toMatch(/private/);
  });
});
