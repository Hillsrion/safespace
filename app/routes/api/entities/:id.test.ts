import { vi, describe, it, expect, beforeEach } from "vitest";
import { json } from "@remix-run/node";
import { loader } from "./:id"; // Assuming the file is named :id.ts
import { reportedEntityRepository } from "~/db/repositories/reportedEntities/index.server";
import { requireUserId } from "~/services/auth.server";

// Mock repository
vi.mock("~/db/repositories/reportedEntities/index.server", () => ({
  reportedEntityRepository: {
    getById: vi.fn(),
  },
}));

// Mock auth service
vi.mock("~/services/auth.server", () => ({
  requireUserId: vi.fn(),
}));

const mockRepo = reportedEntityRepository as unknown as {
  getById: ReturnType<typeof vi.fn>;
};
const mockRequireUserId = requireUserId as ReturnType<typeof vi.fn>;

describe("API Route - /api/entities/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockEntity = { id: "entity1", name: "Test Entity", handles: [] };

  it("should return entity data if found and user authenticated", async () => {
    mockRequireUserId.mockResolvedValue("user123"); // Simulate authenticated user
    mockRepo.getById.mockResolvedValue(mockEntity);

    const request = new Request("http://localhost/api/entities/entity1");
    const response = await loader({
      request,
      params: { id: "entity1" },
      context: {},
    });

    const responseData = await response.json();

    expect(mockRequireUserId).toHaveBeenCalledWith(request);
    expect(mockRepo.getById).toHaveBeenCalledWith("entity1");
    expect(response.status).toBe(200);
    expect(responseData).toEqual(mockEntity);
  });

  it("should return 404 if entity not found", async () => {
    mockRequireUserId.mockResolvedValue("user123");
    mockRepo.getById.mockResolvedValue(null);

    const request = new Request("http://localhost/api/entities/unknown");
    const response = await loader({
      request,
      params: { id: "unknown" },
      context: {},
    });

    const responseData = await response.json();

    expect(response.status).toBe(404);
    expect(responseData).toEqual({ message: "Reported entity not found" });
  });

  it("should return 400 if ID parameter is missing", async () => {
    mockRequireUserId.mockResolvedValue("user123");
    // Route matching should prevent this, but good to have a conceptual test
    const request = new Request("http://localhost/api/entities/");
    const response = await loader({
      request,
      params: {}, // No id
      context: {},
    });
    const responseData = await response.json();

    expect(response.status).toBe(400);
    expect(responseData).toEqual({ message: "Reported entity ID is required" });
    expect(mockRepo.getById).not.toHaveBeenCalled();
  });

  it("should return 401/redirect if user not authenticated (if requireUserId throws)", async () => {
    // This test depends on how requireUserId handles unauthenticated users.
    // If it throws a specific error or a Response, we catch that.
    const authError = new Response("Unauthorized", { status: 401 });
    mockRequireUserId.mockRejectedValue(authError);

    const request = new Request("http://localhost/api/entities/entity1");

    try {
      await loader({
        request,
        params: { id: "entity1" },
        context: {},
      });
    } catch (errorResponse) {
      expect(errorResponse).toEqual(authError);
    }
    expect(mockRequireUserId).toHaveBeenCalledWith(request);
    expect(mockRepo.getById).not.toHaveBeenCalled();
  });

  it("should return 500 if repository throws an unexpected error", async () => {
    mockRequireUserId.mockResolvedValue("user123");
    mockRepo.getById.mockRejectedValue(new Error("Database connection error"));

    const request = new Request("http://localhost/api/entities/entity1");
    const response = await loader({
      request,
      params: { id: "entity1" },
      context: {},
    });
    const responseData = await response.json();

    expect(response.status).toBe(500);
    expect(responseData).toEqual({ message: "Error fetching reported entity" });
  });
});
