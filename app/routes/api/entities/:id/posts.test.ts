import { vi, describe, it, expect, beforeEach } from "vitest";
import { json } from "@remix-run/node";
import { loader } from "./:id/posts"; // Assuming the file is named posts.ts inside :id directory
import { reportedEntityRepository } from "~/db/repositories/reportedEntities/index.server";
import { requireUserId } from "~/services/auth.server";

// Mock repository
vi.mock("~/db/repositories/reportedEntities/index.server", () => ({
  reportedEntityRepository: {
    getById: vi.fn(), // For the check if entity exists
    getPosts: vi.fn(),
  },
}));

// Mock auth service
vi.mock("~/services/auth.server", () => ({
  requireUserId: vi.fn(),
}));

const mockRepo = reportedEntityRepository as unknown as {
  getById: ReturnType<typeof vi.fn>;
  getPosts: ReturnType<typeof vi.fn>;
};
const mockRequireUserId = requireUserId as ReturnType<typeof vi.fn>;

describe("API Route - /api/entities/:id/posts", () => {
  const mockUserId = "user123";
  const mockReportedEntityId = "entity1";
  // Updated mockPosts to reflect richer structure (simplified for this example)
  const mockRichPosts = [
    {
      id: "post1",
      content: "Test Post Rich",
      createdAt: new Date().toISOString(),
      author: { id: mockUserId, name: "Current User", username: "testuser", role: "user" },
      // other fields like space, media, reportedEntity (of the post) would be here
    }
  ];
  const mockEntity = { id: mockReportedEntityId, name: "Test Entity", handles: [] };

  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireUserId.mockResolvedValue(mockUserId);
  });

  it("should return rich posts data if entity found and user authenticated", async () => {
    mockRepo.getById.mockResolvedValue(mockEntity);
    mockRepo.getPosts.mockResolvedValue(mockRichPosts);

    const request = new Request(`http://localhost/api/entities/${mockReportedEntityId}/posts`);
    const response = await loader({
      request,
      params: { id: mockReportedEntityId },
      context: {},
    });

    // Check if response is from `data()` or an error Response
    if (!(response instanceof Response) || response.headers.get("Content-Type")?.includes("application/json")) {
        const responseData = await response.json(); // This line throws if response is not valid JSON
        expect(response.status).toBe(200); // Check status if json() was used by `data()`
        expect(responseData).toEqual(mockRichPosts); // data() wraps it in { data: ... } if using older Remix `data` or just the object. Assuming direct object for now.
                                                   // For `data()` from `@remix-run/node` (new versions), it's just `json(payload)`
    } else {
        throw new Error("Response was not a JSON response as expected from data() utility");
    }


    expect(mockRequireUserId).toHaveBeenCalledWith(request);
    expect(mockRepo.getById).toHaveBeenCalledWith(mockReportedEntityId);
    expect(mockRepo.getPosts).toHaveBeenCalledWith(mockReportedEntityId, mockUserId);
  });

  it("should return 404 using errors.notFound if reported entity itself is not found", async () => {
    mockRepo.getById.mockResolvedValue(null);

    const request = new Request(`http://localhost/api/entities/${mockReportedEntityId}/posts`);

    try {
      await loader({ request, params: { id: mockReportedEntityId }, context: {} });
      throw new Error("Loader did not throw"); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError); // Assuming errors.notFound throws HttpError
      const httpError = error as HttpError;
      expect(httpError.status).toBe(404);
      // expect(httpError.message).toBe("Reported entity not found"); // Or whatever message errors.notFound uses
      // Check specific code if set, e.g. expect(httpError.code).toBe("not_found:reported_entity");
      const errorResponse = httpError.toResponse();
      const responseData = await errorResponse.json();
      expect(responseData.error).toBe("Reported entity not found");
      expect(responseData.code).toBe("not_found:reported_entity");


    }
    expect(mockRepo.getById).toHaveBeenCalledWith(mockReportedEntityId);
    expect(mockRepo.getPosts).not.toHaveBeenCalled();
  });

  it("should return 400 using errors.badRequest if ID parameter is missing", async () => {
    const request = new Request("http://localhost/api/entities//posts");
    try {
      await loader({ request, params: {}, context: {} });
      throw new Error("Loader did not throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.status).toBe(400);
      const errorResponse = httpError.toResponse();
      const responseData = await errorResponse.json();
      expect(responseData.error).toBe("Reported entity ID is required");
    }
    expect(mockRepo.getPosts).not.toHaveBeenCalled();
  });

  it("should re-throw HttpError from requireUserId if user not authenticated", async () => {
    // Assuming requireUserId throws an HttpError (e.g., errors.unauthorized())
    const authError = new HttpError(401, "Unauthorized", "unauthorized:auth");
    mockRequireUserId.mockRejectedValue(authError); // Simulate requireUserId throwing this error

    const request = new Request(`http://localhost/api/entities/${mockReportedEntityId}/posts`);
    try {
      await loader({ request, params: { id: mockReportedEntityId }, context: {} });
      throw new Error("Loader did not throw");
    } catch (error) {
      expect(error).toEqual(authError); // Should be the exact HttpError instance
    }
    expect(mockRequireUserId).toHaveBeenCalledWith(request);
    expect(mockRepo.getPosts).not.toHaveBeenCalled();
  });

  it("should return 404 using errors.notFound if user not found by repository", async () => {
    mockRepo.getById.mockResolvedValue(mockEntity);
    // Simulate the specific error message that the loader checks for
    mockRepo.getPosts.mockRejectedValue(new Error("User not found"));

    const request = new Request(`http://localhost/api/entities/${mockReportedEntityId}/posts`);
    try {
      await loader({ request, params: { id: mockReportedEntityId }, context: {} });
      throw new Error("Loader did not throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.status).toBe(404);
      // expect(httpError.message).toBe("User not found for posts query");
      const errorResponse = httpError.toResponse();
      const responseData = await errorResponse.json();
      expect(responseData.error).toBe("User not found for posts query");
      expect(responseData.code).toBe("not_found:user");
    }
  });

  it("should return 500 using errors.internalServerError if getPosts throws an unexpected error", async () => {
    mockRepo.getById.mockResolvedValue(mockEntity);
    mockRepo.getPosts.mockRejectedValue(new Error("Database connection error"));

    const request = new Request(`http://localhost/api/entities/${mockReportedEntityId}/posts`);
    try {
      await loader({ request, params: { id: mockReportedEntityId }, context: {} });
      throw new Error("Loader did not throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.status).toBe(500);
      const errorResponse = httpError.toResponse();
      const responseData = await errorResponse.json();
      expect(responseData.error).toBe("An unexpected error occurred while fetching posts for the reported entity.");
    }
  });

  it("should return 500 using errors.internalServerError if getById throws an unexpected error", async () => {
    mockRepo.getById.mockRejectedValue(new Error("Database error checking entity"));

    const request = new Request(`http://localhost/api/entities/${mockReportedEntityId}/posts`);
     try {
      await loader({ request, params: { id: mockReportedEntityId }, context: {} });
      throw new Error("Loader did not throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpError = error as HttpError;
      expect(httpError.status).toBe(500);
       const errorResponse = httpError.toResponse();
      const responseData = await errorResponse.json();
      expect(responseData.error).toBe("An unexpected error occurred while fetching posts for the reported entity.");
    }
    expect(mockRepo.getPosts).not.toHaveBeenCalled();
  });
});
