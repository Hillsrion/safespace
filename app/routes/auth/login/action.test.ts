import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InvalidCredentialsError extends Error {
    constructor() {
      super("Invalid credentials");
      this.name = "InvalidCredentialsError";
    }
  }
  return {
    InvalidCredentialsError,
    login: vi.fn(),
    isAuthenticated: vi.fn(),
    getSession: vi.fn(),
    commitSession: vi.fn(),
    logServerException: vi.fn(),
  };
});

vi.mock("../../../services/auth.server", () => ({
  InvalidCredentialsError: mocks.InvalidCredentialsError,
  login: mocks.login,
  isAuthenticated: mocks.isAuthenticated,
}));
vi.mock("../../../services/session.server", () => ({
  getSession: mocks.getSession,
  commitSession: mocks.commitSession,
}));
vi.mock("../../../lib/error/server-error.server", () => ({
  logServerException: mocks.logServerException,
}));

import { action } from "./action";

describe("login failure handling", () => {
  const session = { flash: vi.fn(), set: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(session);
    mocks.commitSession.mockResolvedValue("session-cookie");
    mocks.isAuthenticated.mockResolvedValue(false);
  });

  it("does not report expected credential rejection as a server exception", async () => {
    mocks.login.mockRejectedValue(new mocks.InvalidCredentialsError());
    const request = new Request("https://safespace.test/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=member%40example.test&password=wrong",
    });

    const response = await action({ request });

    expect(response.status).toBe(400);
    expect(session.flash).toHaveBeenCalledWith("error", "Invalid credentials");
    expect(mocks.logServerException).not.toHaveBeenCalled();
  });

  it("reports only unexpected authentication failures", async () => {
    const error = new Error("database URL with secret");
    mocks.login.mockRejectedValue(error);
    const request = new Request("https://safespace.test/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=member%40example.test&password=wrong",
    });

    await action({ request });

    expect(mocks.logServerException).toHaveBeenCalledWith(error, {
      operation: "auth.login",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
  });
});
