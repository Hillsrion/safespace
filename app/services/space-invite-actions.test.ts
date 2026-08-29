import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("./space-invite.server", () => {
  class SpaceInviteError extends Error {
    constructor(public status: 403 | 404 | 409, message: string) {
      super(message);
    }
  }
  return { SpaceInviteError, createSpaceInvite: vi.fn() };
});

import { getCurrentUser } from "./auth.server";
import { createSpaceInviteAction } from "./space-invite-actions.server";
import { createSpaceInvite } from "./space-invite.server";

const actorId = "00000000-0000-4000-8000-000000000001";
const spaceId = "00000000-0000-4000-8000-000000000002";

function jsonRequest(method: string, body?: unknown, origin = "https://safe.test") {
  return new Request(
    `https://safe.test/resources/api/admin/spaces/${spaceId}/invites`,
    {
      method,
      headers: {
        Origin: origin,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );
}

describe("space invitation HTTP boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: actorId,
      firstName: "Ada",
      lastName: "Admin",
    } as never);
  });

  it("requires exact POST, same origin, and authentication", async () => {
    const wrongMethod = await createSpaceInviteAction({
      request: jsonRequest("PUT", { email: "new@example.test", role: "EDITOR" }),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("Allow")).toBe("POST");

    const crossOrigin = await createSpaceInviteAction({
      request: jsonRequest("POST", { email: "new@example.test", role: "EDITOR" }, "https://evil.test"),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(crossOrigin.status).toBe(403);

    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const unauthenticated = await createSpaceInviteAction({
      request: jsonRequest("POST", { email: "new@example.test", role: "EDITOR" }),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(unauthenticated.status).toBe(401);
    expect(createSpaceInvite).not.toHaveBeenCalled();
  });

  it("rejects invalid paths, malformed JSON, and undeclared fields", async () => {
    const invalidPath = await createSpaceInviteAction({
      request: jsonRequest("POST", { email: "new@example.test", role: "EDITOR" }),
      params: { spaceId: "not-a-uuid" },
      context: undefined,
    } as never);
    expect(invalidPath.status).toBe(400);

    const malformed = await createSpaceInviteAction({
      request: new Request(
        `https://safe.test/resources/api/admin/spaces/${spaceId}/invites`,
        { method: "POST", headers: { Origin: "https://safe.test" }, body: "{" }
      ),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(malformed.status).toBe(400);

    const massAssignment = await createSpaceInviteAction({
      request: jsonRequest("POST", {
        email: "new@example.test",
        role: "EDITOR",
        invitedByUserId: "another-user",
      }),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(massAssignment.status).toBe(400);
    expect(createSpaceInvite).not.toHaveBeenCalled();
  });

  it("normalizes input and returns the minimized created invitation", async () => {
    const expectedOrigin = process.env.APP_URL?.trim()
      ? new URL(process.env.APP_URL).origin
      : "https://safe.test";
    vi.mocked(createSpaceInvite).mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000003",
      email: "new@example.test",
      role: "EDITOR",
      expiresAt: "2026-08-30T10:00:00.000Z",
      inviteUrl: "https://safe.test/auth/register?token=raw-token",
      delivery: "sent",
    });
    const response = await createSpaceInviteAction({
      request: jsonRequest("POST", { email: " NEW@Example.Test ", role: "EDITOR" }),
      params: { spaceId },
      context: undefined,
    } as never);

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(createSpaceInvite).toHaveBeenCalledWith(
      expect.objectContaining({ id: actorId }),
      spaceId,
      { email: "new@example.test", role: "EDITOR" },
      expectedOrigin
    );
  });
});
