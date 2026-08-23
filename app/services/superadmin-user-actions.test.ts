import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("./superadmin-user.server", () => {
  class SuperAdminUserError extends Error {
    constructor(public status: 403 | 404, message: string) {
      super(message);
    }
  }
  return {
    SuperAdminUserError,
    listAdminUsers: vi.fn(),
    getAdminUser: vi.fn(),
  };
});

import { getCurrentUser } from "./auth.server";
import {
  getAdminUserLoader,
  listAdminUsersLoader,
} from "./superadmin-user-actions.server";
import { getAdminUser, listAdminUsers } from "./superadmin-user.server";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

describe("SuperAdmin user HTTP boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: ACTOR_ID } as never);
  });

  it("requires authentication", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await listAdminUsersLoader({
      request: new Request("https://safe.test/resources/api/superadmin/users"),
      params: {},
      context: undefined,
    } as never);

    expect(response.status).toBe(401);
    expect(listAdminUsers).not.toHaveBeenCalled();
  });

  it("rejects unknown and malformed filters before querying", async () => {
    const response = await listAdminUsersLoader({
      request: new Request(
        "https://safe.test/resources/api/superadmin/users?includePassword=true&limit=500"
      ),
      params: {},
      context: undefined,
    } as never);

    expect(response.status).toBe(400);
    expect(listAdminUsers).not.toHaveBeenCalled();
  });

  it("forwards only normalized filters", async () => {
    vi.mocked(listAdminUsers).mockResolvedValue({
      users: [],
      nextCursor: null,
      hasMore: false,
    });
    const response = await listAdminUsersLoader({
      request: new Request(
        "https://safe.test/resources/api/superadmin/users?limit=10&isSuperAdmin=false&role=EDITOR"
      ),
      params: {},
      context: undefined,
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(listAdminUsers).toHaveBeenCalledWith(
      { id: ACTOR_ID },
      { limit: 10, isSuperAdmin: false, role: "EDITOR" }
    );
  });

  it("validates detail UUIDs before querying", async () => {
    const invalid = await getAdminUserLoader({
      request: new Request(
        "https://safe.test/resources/api/superadmin/users/not-a-uuid"
      ),
      params: { userId: "not-a-uuid" },
      context: undefined,
    } as never);
    expect(invalid.status).toBe(400);
    expect(getAdminUser).not.toHaveBeenCalled();

    vi.mocked(getAdminUser).mockResolvedValue({ id: USER_ID } as never);
    const valid = await getAdminUserLoader({
      request: new Request(
        `https://safe.test/resources/api/superadmin/users/${USER_ID}`
      ),
      params: { userId: USER_ID },
      context: undefined,
    } as never);
    expect(valid.status).toBe(200);
    expect(valid.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getAdminUser).toHaveBeenCalledWith({ id: ACTOR_ID }, USER_ID);
  });
});
