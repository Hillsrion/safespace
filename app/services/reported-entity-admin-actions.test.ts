import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth.server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("./reported-entity-admin.server", () => {
  class ReportedEntityAdminError extends Error {
    constructor(
      public status: 403 | 404 | 409,
      message: string,
      public details?: unknown
    ) {
      super(message);
    }
  }
  return {
    ReportedEntityAdminError,
    createReportedEntityForAdmin: vi.fn(),
    deleteReportedEntityForAdmin: vi.fn(),
    getReportedEntityForAdmin: vi.fn(),
    listReportedEntitiesForAdmin: vi.fn(),
    reviewReportedEntityHandle: vi.fn(),
    updateReportedEntityForAdmin: vi.fn(),
  };
});

import { getCurrentUser } from "./auth.server";
import {
  createReportedEntityAction,
  listReportedEntitiesLoader,
  mutateReportedEntityAction,
  reviewReportedEntityHandleAction,
} from "./reported-entity-admin-actions.server";
import {
  createReportedEntityForAdmin,
  deleteReportedEntityForAdmin,
  listReportedEntitiesForAdmin,
  reviewReportedEntityHandle,
} from "./reported-entity-admin.server";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "22222222-2222-4222-8222-222222222222";
const ENTITY_ID = "33333333-3333-4333-8333-333333333333";
const HANDLE_ID = "44444444-4444-4444-8444-444444444444";
const actor = { id: ACTOR_ID };

function request(
  path: string,
  method = "GET",
  body?: unknown,
  options: { origin?: string; contentType?: string } = {}
) {
  return new Request(`https://safe.test${path}`, {
    method,
    headers: {
      ...(method === "GET"
        ? {}
        : { Origin: options.origin ?? "https://safe.test" }),
      ...(body === undefined
        ? {}
        : { "Content-Type": options.contentType ?? "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("reported entity admin HTTP boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(actor as never);
  });

  it("rejects cross-origin create, update, and delete before service access", async () => {
    const create = await createReportedEntityAction({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/entities`,
        "POST",
        { name: "Entity", handles: [{ platform: "Instagram", handle: "entity" }] },
        { origin: "https://evil.test" }
      ),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);
    const update = await mutateReportedEntityAction({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/entities/${ENTITY_ID}`,
        "PUT",
        { name: "Changed" },
        { origin: "https://evil.test" }
      ),
      params: { spaceId: SPACE_ID, entityId: ENTITY_ID },
      context: undefined,
    } as never);
    const deletion = await mutateReportedEntityAction({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/entities/${ENTITY_ID}`,
        "DELETE",
        undefined,
        { origin: "https://evil.test" }
      ),
      params: { spaceId: SPACE_ID, entityId: ENTITY_ID },
      context: undefined,
    } as never);

    expect([create.status, update.status, deletion.status]).toEqual([403, 403, 403]);
    expect(createReportedEntityForAdmin).not.toHaveBeenCalled();
    expect(deleteReportedEntityForAdmin).not.toHaveBeenCalled();
  });

  it("requires authentication and validates strict paths and list queries", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const unauthenticated = await listReportedEntitiesLoader({
      request: request(`/resources/api/spaces/${SPACE_ID}/entities`),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);
    expect(unauthenticated.status).toBe(401);

    const invalidPath = await listReportedEntitiesLoader({
      request: request("/resources/api/spaces/invalid/entities"),
      params: { spaceId: "invalid" },
      context: undefined,
    } as never);
    expect(invalidPath.status).toBe(400);

    const invalidQuery = await listReportedEntitiesLoader({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/entities?limit=101&extra=true`
      ),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);
    expect(invalidQuery.status).toBe(400);

    const duplicateQuery = await listReportedEntitiesLoader({
      request: request(
        `/resources/api/admin/spaces/${SPACE_ID}/reported-entities?limit=10&limit=20`
      ),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);
    expect(duplicateQuery.status).toBe(400);
    expect(listReportedEntitiesForAdmin).not.toHaveBeenCalled();
  });

  it("rejects the historical PATCH update method", async () => {
    const response = await mutateReportedEntityAction({
      request: request(
        `/resources/api/admin/spaces/${SPACE_ID}/reported-entities/${ENTITY_ID}`,
        "PATCH",
        { name: "Changed" }
      ),
      params: { spaceId: SPACE_ID, entityId: ENTITY_ID },
      context: undefined,
    } as never);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("PUT, DELETE");
  });

  it("requires POST JSON with no mass-assignment fields", async () => {
    const wrongMethod = await createReportedEntityAction({
      request: request(`/resources/api/spaces/${SPACE_ID}/entities`, "PUT", {}),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("Allow")).toBe("POST");

    const wrongType = await createReportedEntityAction({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/entities`,
        "POST",
        { name: "Entity", handles: [{ platform: "Instagram", handle: "entity" }] },
        { contentType: "text/plain" }
      ),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);
    expect(wrongType.status).toBe(400);

    const massAssignment = await createReportedEntityAction({
      request: request(`/resources/api/spaces/${SPACE_ID}/entities`, "POST", {
        name: "Entity",
        handles: [{ platform: "Instagram", handle: "entity" }],
        spaceId: "44444444-4444-4444-8444-444444444444",
      }),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);
    expect(massAssignment.status).toBe(400);
    expect(createReportedEntityForAdmin).not.toHaveBeenCalled();
  });

  it("returns a documented create response using only validated data", async () => {
    vi.mocked(createReportedEntityForAdmin).mockResolvedValue({
      id: ENTITY_ID,
      name: "Entity",
      spaceId: SPACE_ID,
      createdAt: "2026-08-23T10:00:00.000Z",
      updatedAt: "2026-08-23T10:00:00.000Z",
      handles: [],
      postCount: 0,
    });

    const response = await createReportedEntityAction({
      request: request(`/resources/api/spaces/${SPACE_ID}/entities`, "POST", {
        name: " Entity ",
        handles: [{ platform: "Instagram", handle: "@Entity" }],
      }),
      params: { spaceId: SPACE_ID },
      context: undefined,
    } as never);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      success: true,
      entity: { id: ENTITY_ID, spaceId: SPACE_ID },
    });
    expect(createReportedEntityForAdmin).toHaveBeenCalledWith(actor, SPACE_ID, {
      name: "Entity",
      handles: [{ platform: "Instagram", handle: "entity" }],
    });
  });

  it("rejects cross-origin and non-PATCH handle review requests before service access", async () => {
    const crossOrigin = await reviewReportedEntityHandleAction({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/entities/${ENTITY_ID}/handles/${HANDLE_ID}/review`,
        "PATCH",
        { status: "consistent", note: "Matches the report context." },
        { origin: "https://evil.test" }
      ),
      params: { spaceId: SPACE_ID, entityId: ENTITY_ID, handleId: HANDLE_ID },
      context: undefined,
    } as never);
    const wrongMethod = await reviewReportedEntityHandleAction({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/entities/${ENTITY_ID}/handles/${HANDLE_ID}/review`,
        "POST",
        { status: "consistent", note: "Matches the report context." }
      ),
      params: { spaceId: SPACE_ID, entityId: ENTITY_ID, handleId: HANDLE_ID },
      context: undefined,
    } as never);

    expect(crossOrigin.status).toBe(403);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("Allow")).toBe("PATCH");
    expect(reviewReportedEntityHandle).not.toHaveBeenCalled();
  });

  it("requires a signed-in actor and strictly validated handle-review path and body", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const unauthenticated = await reviewReportedEntityHandleAction({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/entities/${ENTITY_ID}/handles/${HANDLE_ID}/review`,
        "PATCH",
        { status: "consistent", note: "Matches the report context." }
      ),
      params: { spaceId: SPACE_ID, entityId: ENTITY_ID, handleId: HANDLE_ID },
      context: undefined,
    } as never);
    const invalidPath = await reviewReportedEntityHandleAction({
      request: request(
        "/resources/api/spaces/invalid/entities/invalid/handles/invalid/review",
        "PATCH",
        { status: "consistent", note: "Matches the report context." }
      ),
      params: { spaceId: "invalid", entityId: "invalid", handleId: "invalid" },
      context: undefined,
    } as never);
    const missingReason = await reviewReportedEntityHandleAction({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/entities/${ENTITY_ID}/handles/${HANDLE_ID}/review`,
        "PATCH",
        { status: "consistent" }
      ),
      params: { spaceId: SPACE_ID, entityId: ENTITY_ID, handleId: HANDLE_ID },
      context: undefined,
    } as never);
    const massAssignment = await reviewReportedEntityHandleAction({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/entities/${ENTITY_ID}/handles/${HANDLE_ID}/review`,
        "PATCH",
        {
          status: "consistent",
          note: "Matches the report context.",
          reviewedByUserId: "99999999-9999-4999-8999-999999999999",
        }
      ),
      params: { spaceId: SPACE_ID, entityId: ENTITY_ID, handleId: HANDLE_ID },
      context: undefined,
    } as never);

    expect([unauthenticated.status, invalidPath.status, missingReason.status, massAssignment.status]).toEqual([
      401, 400, 400, 400,
    ]);
    expect(reviewReportedEntityHandle).not.toHaveBeenCalled();
  });

  it("accepts a reset to unreviewed and forwards only the closed, normalized review payload", async () => {
    vi.mocked(reviewReportedEntityHandle).mockResolvedValue({
      id: HANDLE_ID,
      reviewStatus: "unreviewed",
      reviewNote: null,
      reviewedAt: null,
    });

    const response = await reviewReportedEntityHandleAction({
      request: request(
        `/resources/api/spaces/${SPACE_ID}/entities/${ENTITY_ID}/handles/${HANDLE_ID}/review`,
        "PATCH",
        { status: "unreviewed", note: "  Ignored by the service reset.  " }
      ),
      params: { spaceId: SPACE_ID, entityId: ENTITY_ID, handleId: HANDLE_ID },
      context: undefined,
    } as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      review: {
        id: HANDLE_ID,
        reviewStatus: "unreviewed",
        reviewNote: null,
        reviewedAt: null,
      },
    });
    expect(reviewReportedEntityHandle).toHaveBeenCalledWith(
      actor,
      SPACE_ID,
      ENTITY_ID,
      HANDLE_ID,
      { status: "unreviewed", note: "Ignored by the service reset." }
    );
  });
});
