import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  updateOwnAccount: vi.fn(),
  deleteAccountAction: vi.fn(),
}));
vi.mock("./auth.server", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("./account-profile.server", () => ({
  AccountProfileError: class AccountProfileError extends Error {},
  updateOwnAccount: mocks.updateOwnAccount,
}));
vi.mock("./member-lifecycle-actions.server", () => ({
  deleteAccountAction: mocks.deleteAccountAction,
}));

import { authMeLoader, currentUserAction, currentUserLoader } from "./account-api-actions.server";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@safe.test",
  firstName: "Safe",
  lastName: "Member",
  instagram: "safe.member",
  isSuperAdmin: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

function args(method: string, body?: unknown, origin = "https://safe.test") {
  return {
    request: new Request("https://safe.test/resources/api/users/current", {
      method,
      headers: { Origin: origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: {},
  } as never;
}

describe("current account API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.updateOwnAccount.mockResolvedValue(undefined);
    mocks.deleteAccountAction.mockResolvedValue(Response.json({ success: true }));
  });

  it("serves auth/me and users/current through the same secret-free DTO", async () => {
    for (const loader of [authMeLoader, currentUserLoader]) {
      const response = await loader(args("GET"));
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const body = await response.json();
      expect(body).toEqual(expect.objectContaining({ id: user.id, name: "Safe Member" }));
      expect(body).not.toHaveProperty("password");
      expect(body).not.toHaveProperty("isSuperAdmin");
    }
  });

  it("returns 401 without reflecting session or request data", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await currentUserLoader(args("GET"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Authentication required" });
  });

  it("maps the PRD name field losslessly and re-reads the durable user", async () => {
    mocks.getCurrentUser
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ ...user, firstName: "New", lastName: "Name" });
    const response = await currentUserAction(args("PUT", {
      name: "New Name",
      currentPassword: "Current1!",
      newPassword: "Changed1!",
    }));
    expect(response.status).toBe(200);
    expect(mocks.updateOwnAccount).toHaveBeenCalledWith(user.id, expect.objectContaining({
      firstName: "New", lastName: "Name", currentPassword: "Current1!", newPassword: "Changed1!",
    }));
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(2);
  });

  it("rejects cross-origin updates and ambiguous field combinations", async () => {
    expect((await currentUserAction(args("PUT", { name: "New Name" }, "https://evil.test"))).status).toBe(403);
    expect((await currentUserAction(args("PUT", { name: "New Name", firstName: "Other" }))).status).toBe(400);
    expect(mocks.updateOwnAccount).not.toHaveBeenCalled();
  });

  it("preserves a single-part PRD name without inventing a surname", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(user).mockResolvedValueOnce({ ...user, firstName: "Madonna", lastName: "" });
    const response = await currentUserAction(args("PUT", { name: "Madonna" }));
    expect(response.status).toBe(200);
    expect(mocks.updateOwnAccount).toHaveBeenCalledWith(user.id, expect.objectContaining({ firstName: "Madonna", lastName: "" }));
  });

  it("preserves the stronger existing account deletion contract", async () => {
    const requestArgs = args("DELETE", {
      password: "Current1!", confirmation: "DELETE_ACCOUNT", contributionPolicy: "anonymize",
    });
    const response = await currentUserAction(requestArgs);
    expect(response.status).toBe(200);
    expect(mocks.deleteAccountAction).toHaveBeenCalledWith(requestArgs);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects unsupported methods with an Allow header", async () => {
    const response = await currentUserAction(args("PATCH", {}));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("PUT, DELETE");
  });
});
