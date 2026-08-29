import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("./space-member-list.server", () => {
  class SpaceMemberListError extends Error {
    constructor(public status: 403 | 404, message: string) {
      super(message);
    }
  }
  return {
    SpaceMemberListError,
    listSpaceMembers: vi.fn(),
  };
});

import { getCurrentUser } from "./auth.server";
import { listSpaceMembersLoader } from "./space-member-list-actions.server";
import { listSpaceMembers } from "./space-member-list.server";

const actorId = "00000000-0000-4000-8000-000000000001";
const spaceId = "00000000-0000-4000-8000-000000000002";

function request(query = "", method = "GET") {
  return new Request(
    `https://safe.test/resources/api/admin/spaces/${spaceId}/users${query}`,
    { method }
  );
}

describe("space member list HTTP boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: actorId } as never);
  });

  it("requires GET and authentication", async () => {
    const wrongMethod = await listSpaceMembersLoader({
      request: request("", "POST"),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("Allow")).toBe("GET");

    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const unauthenticated = await listSpaceMembersLoader({
      request: request(),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(unauthenticated.status).toBe(401);
    expect(listSpaceMembers).not.toHaveBeenCalled();
  });

  it("rejects invalid paths, unknown filters, and duplicate filters", async () => {
    const invalidPath = await listSpaceMembersLoader({
      request: request(),
      params: { spaceId: "not-a-uuid" },
      context: undefined,
    } as never);
    expect(invalidPath.status).toBe(400);

    const unknown = await listSpaceMembersLoader({
      request: request("?includePassword=true"),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(unknown.status).toBe(400);

    const duplicate = await listSpaceMembersLoader({
      request: request("?page=1&page=2"),
      params: { spaceId },
      context: undefined,
    } as never);
    expect(duplicate.status).toBe(400);
    expect(listSpaceMembers).not.toHaveBeenCalled();
  });

  it("forwards only normalized, bounded list options", async () => {
    vi.mocked(listSpaceMembers).mockResolvedValue({
      users: [],
      pagination: { page: 2, limit: 10, total: 0, totalPages: 1 },
    });
    const response = await listSpaceMembersLoader({
      request: request("?page=2&limit=10&q=%20Sam%20&role=EDITOR"),
      params: { spaceId },
      context: undefined,
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(listSpaceMembers).toHaveBeenCalledWith(
      expect.objectContaining({ id: actorId }),
      spaceId,
      { page: 2, limit: 10, q: "Sam", role: "EDITOR" }
    );
  });
});
