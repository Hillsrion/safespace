import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./auth.server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("./system-announcements.server", () => ({
  SystemAnnouncementError: class SystemAnnouncementError extends Error { constructor(public status: 403 | 404 | 409, message: string) { super(message); } },
  createSystemAnnouncement: vi.fn(), deleteSystemAnnouncement: vi.fn(), listActiveSystemAnnouncements: vi.fn(), listSystemAnnouncements: vi.fn(), updateSystemAnnouncement: vi.fn(),
}));
import { getCurrentUser } from "./auth.server";
import { createAnnouncementAction, activeAnnouncementsLoader, mutateAnnouncementAction } from "./system-announcements-actions.server";
import { createSystemAnnouncement, listActiveSystemAnnouncements, updateSystemAnnouncement } from "./system-announcements.server";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const request = (path: string, method = "GET", body?: object, origin = "https://safe.test") => new Request(`https://safe.test${path}`, { method, headers: { ...(method === "GET" ? {} : { Origin: origin, "Content-Type": "application/json" }), }, ...(body ? { body: JSON.stringify(body) } : {}) });
describe("system announcement HTTP boundaries", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(getCurrentUser).mockResolvedValue({ id: ACTOR } as never); });
  it("requires authentication for active global notices", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await activeAnnouncementsLoader({ request: request("/resources/api/announcements"), params: {}, context: undefined } as never)).status).toBe(401);
    expect(listActiveSystemAnnouncements).not.toHaveBeenCalled();
  });
  it("rejects cross-origin creation before writes", async () => {
    expect((await createAnnouncementAction({ request: request("/resources/api/superadmin/announcements", "POST", { content: "Notice", publishedAt: "2026-08-28T10:00:00.000Z" }, "https://evil.test"), params: {}, context: undefined } as never)).status).toBe(403);
    expect(createSystemAnnouncement).not.toHaveBeenCalled();
  });
  it("rejects HTML and unknown fields", async () => {
    expect((await createAnnouncementAction({ request: request("/resources/api/superadmin/announcements", "POST", { content: "<strong>Notice</strong>", publishedAt: "2026-08-28T10:00:00.000Z", actor: ACTOR }), params: {}, context: undefined } as never)).status).toBe(400);
    expect(createSystemAnnouncement).not.toHaveBeenCalled();
  });
  it("validates the item path and PATCH payload", async () => {
    expect((await mutateAnnouncementAction({ request: request(`/resources/api/superadmin/announcements/${ID}`, "PATCH", { content: "" }), params: { announcementId: ID }, context: undefined } as never)).status).toBe(400);
    expect(updateSystemAnnouncement).not.toHaveBeenCalled();
  });
  it.each([null, true, 0, "2026-08-28", "bad-date"])("rejects non-ISO publication input %s rather than coercing it", async (publishedAt) => {
    const response = await createAnnouncementAction({ request: request("/resources/api/superadmin/announcements", "POST", { content: "Notice", publishedAt }), params: {}, context: {} } as never);
    expect(response.status).toBe(400);
    expect(createSystemAnnouncement).not.toHaveBeenCalled();
  });
});
