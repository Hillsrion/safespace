import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.server", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("./space-member-admin.server", () => {
  class MembershipAdminError extends Error {
    constructor(public status: 403 | 404 | 409, message: string) {
      super(message);
    }
  }
  return {
    MembershipAdminError,
    changeSpaceMemberRole: vi.fn(),
    kickSpaceMember: vi.fn(),
  };
});

import {
  changeSpaceMemberRoleAction as changeRole,
  kickSpaceMemberAction as kickMember,
} from "./space-member-admin-actions.server";
import { getCurrentUser } from "./auth.server";
import {
  changeSpaceMemberRole,
  kickSpaceMember,
  MembershipAdminError,
} from "./space-member-admin.server";

const spaceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const actor = { id: "00000000-0000-4000-8000-000000000003" };

function jsonRequest(method: string, body?: unknown, origin = "https://safe.test") {
  return new Request(`https://safe.test/resources/api/spaces/${spaceId}/members/${userId}`, {
    method,
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("member administration resource actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires authentication and rejects CSRF requests before role changes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const unauthenticated = await changeRole({
      request: jsonRequest("PATCH", { role: "EDITOR" }),
      params: { spaceId, userId },
      context: undefined,
    } as never);
    expect(unauthenticated.status).toBe(401);

    const crossOrigin = await changeRole({
      request: jsonRequest("PATCH", { role: "EDITOR" }, "https://evil.test"),
      params: { spaceId, userId },
      context: undefined,
    } as never);
    expect(crossOrigin.status).toBe(403);
    expect(changeSpaceMemberRole).not.toHaveBeenCalled();
  });

  it("validates UUID path parameters and the replacement role", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(actor as never);
    const invalidPath = await changeRole({
      request: jsonRequest("PATCH", { role: "EDITOR" }),
      params: { spaceId: "not-a-uuid", userId },
      context: undefined,
    } as never);
    expect(invalidPath.status).toBe(400);

    const invalidRole = await changeRole({
      request: jsonRequest("PATCH", { role: "OWNER" }),
      params: { spaceId, userId },
      context: undefined,
    } as never);
    expect(invalidRole.status).toBe(400);
    expect(changeSpaceMemberRole).not.toHaveBeenCalled();
  });

  it("preserves conflict and not-found outcomes from the transactional service", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(actor as never);
    vi.mocked(changeSpaceMemberRole).mockRejectedValue(
      new MembershipAdminError(409, "A space must retain at least one administrator")
    );
    const conflict = await changeRole({
      request: jsonRequest("PATCH", { role: "EDITOR" }),
      params: { spaceId, userId },
      context: undefined,
    } as never);
    expect(conflict.status).toBe(409);

    vi.mocked(kickSpaceMember).mockRejectedValue(
      new MembershipAdminError(404, "Member not found in this space")
    );
    const missingMember = await kickMember({
      request: jsonRequest("DELETE"),
      params: { spaceId, userId },
      context: undefined,
    } as never);
    expect(missingMember.status).toBe(404);
  });
});
