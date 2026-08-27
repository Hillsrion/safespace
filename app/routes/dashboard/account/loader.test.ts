import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), spaces: vi.fn() }));
vi.mock("../../../services/auth.server", () => ({ requireUserId: async () => "member" }));
vi.mock("../../../services/moderation-governance.server", () => ({ listOwnModerationDecisions: async () => [] }));
vi.mock("../../../db/client.server", () => ({ prisma: { user: { findUnique: mocks.user }, space: { findMany: mocks.spaces } } }));
import { loader } from "./loader";

describe("account controls after suspension", () => {
  it("keeps departure controls available without joining an RLS-hidden space", async () => {
    mocks.user.mockResolvedValue({ id: "member", memberships: [{ spaceId: "visible", role: "EDITOR" }, { spaceId: "suspended", role: "ADMIN" }] });
    mocks.spaces.mockResolvedValue([{ id: "visible", name: "My community" }]);
    const response = await loader({ request: new Request("https://safe.test/dashboard/account"), params: {}, context: {} });
    expect(response.data.memberships).toEqual([
      { role: "EDITOR", space: { id: "visible", name: "My community" } },
      { role: "ADMIN", space: { id: "suspended", name: "Espace à accès suspendu" } },
    ]);
    expect(mocks.user).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ memberships: { orderBy: { joinedAt: "asc" }, select: { role: true, spaceId: true } } }) }));
  });
});
