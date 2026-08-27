import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findInvite: vi.fn(), claim: vi.fn(), createUser: vi.fn(), membership: vi.fn(),
  hash: vi.fn(), setSession: vi.fn(), log: vi.fn(),
}));
vi.mock("../../../db/client.server", () => ({ prisma: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
  invite: { findFirst: mocks.findInvite, updateMany: mocks.claim },
  user: { create: mocks.createUser }, userSpaceMembership: { create: mocks.membership },
}) } }));
vi.mock("../../../db/context.server", () => ({ runWithDbContext: (_ctx: unknown, fn: () => unknown) => fn() }));
vi.mock("../../../lib/password", () => ({ hashPassword: mocks.hash, validatePassword: () => true }));
vi.mock("../../../services/session.server", () => ({
  getSession: async () => ({ set: mocks.setSession }), commitSession: async () => "safe-session",
}));
vi.mock("../../../lib/error/server-error.server", () => ({ logServerException: mocks.log }));
import { action } from "./action";

const SPACE = "11111111-1111-4111-8111-111111111111";
function submit(overrides: Record<string, string> = {}) {
  const body = new URLSearchParams({ email: "member@example.test", password: "Strong#Pass2026", confirmPassword: "Strong#Pass2026", firstName: "Member", lastName: "Test", inviteToken: "test-token", codeOfConductAccepted: "on", ...overrides });
  return action({ request: new Request("https://safe.test/auth/register", { method: "POST", body: body.toString(), headers: { Origin: "https://safe.test", "Content-Type": "application/x-www-form-urlencoded" } }) });
}
describe("registration acceptance and destination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findInvite.mockResolvedValue({ id: "invite", spaceId: SPACE, email: "member@example.test", roleToAssign: "EDITOR", isUsed: false, expiresAt: new Date(Date.now() + 60000) });
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.hash.mockResolvedValue("hashed");
    mocks.createUser.mockResolvedValue({ id: "new-member" });
  });
  it("requires explicit conduct acceptance before accessing the invitation", async () => {
    const response = await submit({ codeOfConductAccepted: "false" });
    expect(response).toMatchObject({ init: { status: 400 } });
    expect(mocks.findInvite).not.toHaveBeenCalled();
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it("stores acceptance and lands in the invitation's space, ignoring submitted redirect targets", async () => {
    const response = await submit({ spaceId: "other-space", redirectTo: "https://evil.test" });
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(303);
    expect((response as Response).headers.get("Location")).toBe(`/dashboard/welcome?spaceId=${SPACE}`);
    expect(mocks.createUser).toHaveBeenCalledWith({ data: expect.objectContaining({ codeOfConductAcceptedAt: expect.any(Date) }) });
    expect(mocks.membership).toHaveBeenCalledWith({ data: { userId: "new-member", spaceId: SPACE, role: "EDITOR" } });
    expect(mocks.setSession).toHaveBeenCalledWith("userId", "new-member");
  });
  it("does not create an account when an invitation was consumed concurrently", async () => {
    mocks.claim.mockResolvedValue({ count: 0 });
    expect(await submit()).toMatchObject({ init: { status: 400 } });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it("never returns database error details", async () => {
    mocks.createUser.mockRejectedValue(new Error("private-email@example.test database password"));
    const response = await submit();
    expect(response).toMatchObject({ init: { status: 500 } });
    expect(JSON.stringify(response)).not.toContain("private-email");
    expect(mocks.log).toHaveBeenCalled();
  });
});
