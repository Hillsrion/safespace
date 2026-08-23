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
    updateReportedEntityForAdmin: vi.fn(),
  };
});

import { getCurrentUser } from "./auth.server";
import {
  createReportedEntityAction,
  listReportedEntitiesLoader,
  mutateReportedEntityAction,
} from "./reported-entity-admin-actions.server";
import {
  createReportedEntityForAdmin,
  deleteReportedEntityForAdmin,
  listReportedEntitiesForAdmin,
} from "./reported-entity-admin.server";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "22222222-2222-4222-8222-222222222222";
const ENTITY_ID = "33333333-3333-4333-8333-333333333333";
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
        "PATCH",
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
    expect(listReportedEntitiesForAdmin).not.toHaveBeenCalled();
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
});
