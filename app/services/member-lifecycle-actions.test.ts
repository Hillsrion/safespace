import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("./session.server", () => ({
  getSession: vi.fn(),
  destroySession: vi.fn(),
}));
vi.mock("./member-lifecycle.server", () => {
  class MemberLifecycleError extends Error {
    constructor(public status: 403 | 404 | 409, message: string) {
      super(message);
    }
  }
  return {
    MemberLifecycleError,
    leaveSpace: vi.fn(),
    deleteAccount: vi.fn(),
  };
});

import {
  deleteAccountAction,
  leaveSpaceAction,
} from "./member-lifecycle-actions.server";
import { getCurrentUser } from "./auth.server";
import { destroySession, getSession } from "./session.server";
import {
  deleteAccount,
  leaveSpace,
  MemberLifecycleError,
} from "./member-lifecycle.server";

const spaceId = "00000000-0000-4000-8000-000000000001";
const actor = { id: "00000000-0000-4000-8000-000000000002" };

function request(method: string, body?: unknown, origin = "https://safe.test") {
  return new Request(`https://safe.test/resources/api/spaces/${spaceId}/leave`, {
    method,
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("member lifecycle resource actions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("requires an authenticated same-origin leave request", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const unauthenticated = await leaveSpaceAction({
      request: request("POST", { confirmation: "LEAVE_SPACE", contributionPolicy: "delete" }),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(unauthenticated.status).toBe(401);

    const crossOrigin = await leaveSpaceAction({
      request: request("POST", { confirmation: "LEAVE_SPACE", contributionPolicy: "delete" }, "https://evil.test"),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(crossOrigin.status).toBe(403);
    expect(leaveSpace).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation and a valid UUID before it invokes leave", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(actor as never);
    const missingConfirmation = await leaveSpaceAction({
      request: request("POST", { contributionPolicy: "anonymize" }),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(missingConfirmation.status).toBe(400);

    const invalidSpace = await leaveSpaceAction({
      request: request("POST", { confirmation: "LEAVE_SPACE", contributionPolicy: "delete" }),
      params: { spaceId: "not-a-uuid" },
      context: undefined,
    } as never);
    expect(invalidSpace.status).toBe(400);
    expect(leaveSpace).not.toHaveBeenCalled();
  });

  it("destroys the current session after successful leave or account deletion", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(actor as never);
    vi.mocked(leaveSpace).mockResolvedValue({ spaceId, contributionPolicy: "delete" });
    vi.mocked(deleteAccount).mockResolvedValue({ deletedUserId: actor.id, contributionPolicy: "delete" });
    vi.mocked(getSession).mockResolvedValue({} as never);
    vi.mocked(destroySession).mockResolvedValue("safespace_session_v2=; Max-Age=0");

    const leave = await leaveSpaceAction({
      request: request("POST", { confirmation: "LEAVE_SPACE", contributionPolicy: "delete" }),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(leave.status).toBe(200);
    expect(leave.headers.get("Set-Cookie")).toContain("Max-Age=0");

    const account = await deleteAccountAction({
      request: request("DELETE", {
        confirmation: "DELETE_ACCOUNT",
        contributionPolicy: "delete",
        password: "Correct-password-1!",
      }),
      params: {},
      context: undefined,
    } as never);
    expect(account.status).toBe(200);
    expect(destroySession).toHaveBeenCalledTimes(2);
  });

  it("returns transactional conflict outcomes without deleting a session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(actor as never);
    vi.mocked(leaveSpace).mockRejectedValue(
      new MemberLifecycleError(409, "A space must retain at least one administrator")
    );

    const response = await leaveSpaceAction({
      request: request("POST", { confirmation: "LEAVE_SPACE", contributionPolicy: "delete" }),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(response.status).toBe(409);
    expect(destroySession).not.toHaveBeenCalled();
  });
});
