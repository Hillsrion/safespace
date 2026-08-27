import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("./auth/login/index", () => ({ default: () => null }));
vi.mock("../services/auth.server", () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
}));
vi.mock("../services/session.server", () => ({
  commitSession: vi.fn(),
  getError: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../lib/space-login.server", () => ({
  resolveSpaceLoginDestination: vi.fn(),
}));

import { action, loader } from "./space-login";
import { resolveSpaceLoginDestination } from "../lib/space-login.server";
import { getCurrentUser, login } from "../services/auth.server";
import { commitSession, getError, getSession } from "../services/session.server";

const SPACE_ID = "00000000-0000-4000-8000-000000000001";
const user = { id: "user-1", isSuperAdmin: false };

function request(path = `/${SPACE_ID}/login`, init: RequestInit = {}) {
  return new Request(`https://safespace.test${path}`, init);
}

describe("space login route", () => {
  const session = { flash: vi.fn(), set: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    vi.mocked(getSession).mockResolvedValue(session as never);
    vi.mocked(commitSession).mockResolvedValue("session-cookie" as never);
    vi.mocked(getError).mockResolvedValue({ error: null, setCookie: "" } as never);
    vi.mocked(resolveSpaceLoginDestination).mockResolvedValue("/dashboard" as never);
  });

  it("does not look up or disclose a space before authentication", async () => {
    const response = await loader({
      request: request("/not-a-uuid/login"),
      params: { spaceId: "not-a-uuid" },
      context: undefined,
    } as never);

    expect(response).toMatchObject({ data: { error: null } });
    expect(resolveSpaceLoginDestination).not.toHaveBeenCalled();
  });

  it("uses one generic error for missing credentials without querying space access", async () => {
    const response = await action({
      request: request(undefined, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "",
      }),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(`/${SPACE_ID}/login`);
    expect(session.flash).toHaveBeenCalledWith("error", "Invalid credentials");
    expect(resolveSpaceLoginDestination).not.toHaveBeenCalled();
  });

  it("does not expose authentication failure details", async () => {
    vi.mocked(login).mockRejectedValue(new Error("database connection refused"));

    const response = await action({
      request: request(undefined, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=member%40example.test&password=wrong",
      }),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);

    expect(response.headers.get("Location")).toBe(`/${SPACE_ID}/login`);
    expect(session.flash).toHaveBeenCalledWith("error", "Invalid credentials");
    expect(resolveSpaceLoginDestination).not.toHaveBeenCalled();
  });

  it("redirects after successful login only through the current-access resolver", async () => {
    vi.mocked(login).mockResolvedValue(user as never);
    vi.mocked(resolveSpaceLoginDestination).mockResolvedValue(
      `/dashboard?spaceId=${SPACE_ID}`
    );

    const response = await action({
      request: request(undefined, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=member%40example.test&password=password",
      }),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);

    expect(login).toHaveBeenCalledWith("member@example.test", "password");
    expect(resolveSpaceLoginDestination).toHaveBeenCalledWith(user, SPACE_ID);
    expect(response.headers.get("Location")).toBe(`/dashboard?spaceId=${SPACE_ID}`);
    expect(session.set).toHaveBeenCalledWith("userId", "user-1");
  });
});
