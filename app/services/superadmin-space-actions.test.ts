import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.server", () => ({ getCurrentUser: vi.fn() }));

vi.mock("./superadmin-space.server", () => {
  class SuperAdminSpaceError extends Error {
    constructor(
      public status: 403 | 404 | 409,
      message: string,
      public details?: unknown
    ) {
      super(message);
    }
  }
  return {
    SuperAdminSpaceError,
    createAdminSpace: vi.fn(),
    deleteAdminSpace: vi.fn(),
    getAdminSpace: vi.fn(),
    listAdminAuditLogs: vi.fn(),
    listAdminSpaces: vi.fn(),
    updateAdminSpace: vi.fn(),
  };
});

import { getCurrentUser } from "./auth.server";
import {
  createAdminSpaceAction,
  listAdminAuditLogsLoader,
  listAdminSpacesLoader,
  mutateAdminSpaceAction,
} from "./superadmin-space-actions.server";
import {
  createAdminSpace,
  deleteAdminSpace,
  listAdminAuditLogs,
  listAdminSpaces,
} from "./superadmin-space.server";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "22222222-2222-4222-8222-222222222222";
const actor = { id: ACTOR_ID };

function request(
  path: string,
  method = "GET",
  body?: unknown,
  origin = "https://safe.test"
) {
  return new Request(`https://safe.test${path}`, {
    method,
    headers: {
      ...(method === "GET" ? {} : { Origin: origin }),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("SuperAdmin space HTTP boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(actor as never);
  });

  it("requires authentication before listing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await listAdminSpacesLoader({
      request: request("/resources/api/superadmin/spaces"),
      params: {},
      context: undefined,
    } as never);

    expect(response.status).toBe(401);
    expect(listAdminSpaces).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutations before parsing or writing", async () => {
    const response = await createAdminSpaceAction({
      request: request(
        "/resources/api/superadmin/spaces",
        "POST",
        { name: "Safety" },
        "https://evil.test"
      ),
      params: {},
      context: undefined,
    } as never);

    expect(response.status).toBe(403);
    expect(createAdminSpace).not.toHaveBeenCalled();
  });

  it("returns 405 with Allow and rejects unknown creation fields", async () => {
    const wrongMethod = await createAdminSpaceAction({
      request: request("/resources/api/superadmin/spaces", "PUT", {}),
      params: {},
      context: undefined,
    } as never);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("Allow")).toBe("POST");

    const invalid = await createAdminSpaceAction({
      request: request("/resources/api/superadmin/spaces", "POST", {
        name: "Safety",
        createdBy: ACTOR_ID,
      }),
      params: {},
      context: undefined,
    } as never);
    expect(invalid.status).toBe(400);
    expect(createAdminSpace).not.toHaveBeenCalled();
  });

  it("requires the deletion confirmation body and passes only validated data", async () => {
    vi.mocked(deleteAdminSpace).mockResolvedValue({ deletedSpaceId: SPACE_ID });
    const invalid = await mutateAdminSpaceAction({
      request: request(
        `/resources/api/superadmin/spaces/${SPACE_ID}`,
        "DELETE",
        { confirmation: "DELETE Safety", cascade: true }
      ),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);
    expect(invalid.status).toBe(400);

    const valid = await mutateAdminSpaceAction({
      request: request(
        `/resources/api/superadmin/spaces/${SPACE_ID}`,
        "DELETE",
        { confirmation: "DELETE Safety" }
      ),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);
    expect(valid.status).toBe(200);
    expect(deleteAdminSpace).toHaveBeenCalledWith(
      actor,
      SPACE_ID,
      "DELETE Safety"
    );
  });

  it("validates audit filters before querying and forwards valid filters", async () => {
    const invalid = await listAdminAuditLogsLoader({
      request: request(
        "/resources/api/superadmin/audit-logs?action=password_read"
      ),
      params: {},
      context: undefined,
    } as never);
    expect(invalid.status).toBe(400);
    expect(listAdminAuditLogs).not.toHaveBeenCalled();

    vi.mocked(listAdminAuditLogs).mockResolvedValue({
      logs: [],
      nextCursor: null,
      hasMore: false,
    });
    const valid = await listAdminAuditLogsLoader({
      request: request(
        `/resources/api/superadmin/audit-logs?spaceId=${SPACE_ID}&action=space_update&limit=10`
      ),
      params: {},
      context: undefined,
    } as never);
    expect(valid.status).toBe(200);
    expect(listAdminAuditLogs).toHaveBeenCalledWith(actor, {
      spaceId: SPACE_ID,
      action: "space_update",
      limit: 10,
    });
  });
});
