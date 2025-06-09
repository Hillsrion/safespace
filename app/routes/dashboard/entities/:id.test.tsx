import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ReportedEntityPage, { loader, ErrorBoundary } from "./:id"; // Assuming file is :id.tsx
import type { ReportedEntityWithHandles, ReportedEntityPost } from "~/db/repositories/reportedEntities/types";
import * as remixReact from "@remix-run/react"; // To mock Remix hooks

// Mock Remix hooks
vi.mock("@remix-run/react", async () => {
  const actual = await vi.importActual<typeof remixReact>("@remix-run/react");
  return {
    ...actual,
    useLoaderData: vi.fn(),
    useParams: vi.fn(),
    useRouteError: vi.fn(),
    isRouteErrorResponse: vi.fn(),
  };
});

const mockUseLoaderData = remixReact.useLoaderData as ReturnType<typeof vi.fn>;
const mockUseParams = remixReact.useParams as ReturnType<typeof vi.fn>;
const mockUseRouteError = remixReact.useRouteError as ReturnType<typeof vi.fn>;
const mockIsRouteErrorResponse = remixReact.isRouteErrorResponse as ReturnType<typeof vi.fn>;

import { Post as PostComponent } from "~/components/post"; // Actual PostComponent for integration

// Mock repository
vi.mock("~/db/repositories/reportedEntities/index.server", () => ({
  reportedEntityRepository: {
    getById: vi.fn(),
    getPosts: vi.fn(),
  },
}));

// Mock auth service
vi.mock("~/services/auth.server", () => ({
  requireUserId: vi.fn(),
}));

// Mock PostComponent to check props passed to it
vi.mock("~/components/post", () => ({
  Post: vi.fn(({ id, author, content }) => ( // Simple mock to render some identifiable output
    <div data-testid={`post-${id}`}>
      <p>{content}</p>
      <p>Author: {author.name}</p>
    </div>
  )),
}));


const mockRepo = reportedEntityRepository as unknown as {
  getById: ReturnType<typeof vi.fn>;
  getPosts: ReturnType<typeof vi.fn>;
};
const mockRequireUserId = requireUserId as ReturnType<typeof vi.fn>;
const MockedPostComponent = PostComponent as ReturnType<typeof vi.fn>;


const mockEntity: ReportedEntityWithHandles = {
  id: "entity123",
  name: "Test Entity Name",
  handles: [
    { id: "h1", handle: "entityHandle1", platform: "PlatformX" },
    { id: "h2", handle: "entityHandle2", platform: "PlatformY" },
  ],
  // Added other fields that might be on PrismaReportedEntity for completeness
  createdAt: new Date(),
  updatedAt: new Date(),
  siren: null,
  description: null,
};

// Updated to reflect richer ReportedEntityPost structure (aligned with TPost)
const mockRichPosts: ReportedEntityPost[] = [
  {
    id: "post1",
    userId: "userA", // This field might not be directly used by PostComponent if author object is present
    content: "First post content",
    reportedEntityId: "entity123", // FK, actual reportedEntity object is separate
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "published",
    author: { id: "userA", name: "Author Alpha", username: "alpha", avatarUrl: "", role: "user" },
    space: { id: "space1", name: "Space Alpha", url: "/space/alpha"},
    media: [],
    // This is the entity reported *in the post*, not the page's main entity necessarily
    reportedEntity: { ...mockEntity, name: "Different Reported Entity in Post" }
  },
  {
    id: "post2",
    userId: "userB",
    content: "Second post description",
    reportedEntityId: "entity123",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "published",
    author: { id: "userB", name: "Author Bravo", username: "bravo", avatarUrl: "", role: "user" },
    space: null, // Example of a post not in a space
    media: [{ id: "media1", url: "http://example.com/image.png", type: "image" }],
    reportedEntity: null // Example of a post not directly reporting an entity
  },
];


describe("ReportedEntityPage - Frontend", () => {
  const entityId = "entity123";
  const userId = "userABC";

  beforeEach(() => {
    vi.resetAllMocks();
    mockUseParams.mockReturnValue({ id: entityId });
    mockRequireUserId.mockResolvedValue(userId);
    MockedPostComponent.mockClear(); // Clear mock call history
  });


  describe("Loader", () => {
    it("should return entity and rich posts from repository", async () => {
      mockRepo.getById.mockResolvedValue(mockEntity);
      mockRepo.getPosts.mockResolvedValue(mockRichPosts); // Use richer mock

      const request = new Request(`http://localhost/dashboard/entities/${entityId}`);
      const response = await loader({ request, params: { id: entityId }, context: {} });
      const data = await response.json();

      expect(mockRepo.getById).toHaveBeenCalledWith(entityId);
      expect(mockRequireUserId).toHaveBeenCalledWith(request);
      expect(mockRepo.getPosts).toHaveBeenCalledWith(entityId, userId);
      expect(data).toEqual({ entity: mockEntity, posts: mockRichPosts }); // Expect richer posts
    });

    it("should throw 404 if entity not found by repository", async () => {
      mockRepo.getById.mockResolvedValue(null);

      const request = new Request(`http://localhost/dashboard/entities/${entityId}`);
      await expect(
        loader({ request, params: { id: entityId }, context: {} })
      ).rejects.toMatchObject({
        status: 404,
        // The actual data/statusText depends on the Response thrown in the loader
        // Let's assume loader throws new Response("Reported entity not found.", { status: 404 });
      });
       const rejection = await loader({ request, params: { id: entityId }, context: {} }).catch(e => e);
       expect(rejection.status).toBe(404);
       const responseData = await rejection.json().catch(() => rejection.statusText); // try to parse json or get text
       expect(responseData).toBe("Reported entity not found.");


      expect(mockRepo.getPosts).not.toHaveBeenCalled();
    });

    it("should throw if requireUserId fails (e.g., user not authenticated)", async () => {
      const authErrorResponse = new Response("Unauthorized", { status: 401 });
      mockRequireUserId.mockRejectedValue(authErrorResponse);
      mockRepo.getById.mockResolvedValue(mockEntity); // Assume entity check happens before auth for this test path

      const request = new Request(`http://localhost/dashboard/entities/${entityId}`);
      await expect(
        loader({ request, params: { id: entityId }, context: {} })
      ).rejects.toEqual(authErrorResponse);
      expect(mockRepo.getPosts).not.toHaveBeenCalled();
    });

    it("should throw 400 if entityId param is missing", async () => {
      const request = new Request("http://localhost/dashboard/entities/");
      // Simulate params being empty, though routing usually prevents this state.
      const rejection = await loader({ request, params: { }, context: {} }).catch(e => e);
      expect(rejection.status).toBe(400);
      const responseData = await rejection.json().catch(() => rejection.statusText);
      expect(responseData).toBe("Reported Entity ID is required.");
    });

    it("should throw 500 if getPosts fails with unexpected error", async () => {
        mockRepo.getById.mockResolvedValue(mockEntity);
        mockRepo.getPosts.mockRejectedValue(new Error("DB broke"));

        const request = new Request(`http://localhost/dashboard/entities/${entityId}`);
        const rejection = await loader({ request, params: { id: entityId }, context: {} }).catch(e => e);
        expect(rejection.status).toBe(500);
        const responseData = await rejection.json().catch(() => rejection.statusText);
        expect(responseData).toBe("Error loading reported entity page.");
    });

  });

  describe("Component Rendering - Success (with Tailwind)", () => {
    beforeEach(() => {
      mockUseLoaderData.mockReturnValue({ entity: mockEntity, posts: mockPosts });
    });

    it("should render entity name (as CardTitle) and ID (as CardDescription)", () => {
      // Pass the richer posts to the component via useLoaderData mock
      mockUseLoaderData.mockReturnValue({ entity: mockEntity, posts: mockRichPosts });
      render(<ReportedEntityPage />);
      const titleElement = screen.getByRole('heading', { name: mockEntity.name!, level: 2 });
      expect(titleElement).toBeInTheDocument();
      expect(screen.getByText(`ID: ${mockEntity.id}`)).toBeInTheDocument();
    });

    it("should render entity handles as Badges", () => {
      mockUseLoaderData.mockReturnValue({ entity: mockEntity, posts: mockRichPosts });
      render(<ReportedEntityPage />);
      mockEntity.handles.forEach(handle => {
        expect(screen.getByText((content, element) => {
          return element?.tagName.toLowerCase() === 'div' &&
                 element.textContent === `${handle.platform}: ${handle.handle}`;
        })).toBeInTheDocument();
      });
    });

    it("should render PostComponent for each post with correct props", () => {
      mockUseLoaderData.mockReturnValue({ entity: mockEntity, posts: mockRichPosts });
      render(<ReportedEntityPage />);

      expect(screen.getByRole('heading', { name: "Associated Posts", level: 2})).toBeInTheDocument();
      expect(MockedPostComponent).toHaveBeenCalledTimes(mockRichPosts.length);

      mockRichPosts.forEach((post, index) => {
        // Check if the PostComponent mock was called with props matching the post data
        // The {...(post as unknown as TPost)} spread means props are top-level
        const expectedProps = expect.objectContaining({
          id: post.id,
          author: post.author,
          content: post.content,
          // Add more critical props from TPost that PostComponent relies on
        });
        expect(MockedPostComponent).toHaveBeenNthCalledWith(index + 1, expectedProps, {});

        // Also check if the mock's rendered output is present
        const mockRenderedPost = screen.getByTestId(`post-${post.id}`);
        expect(mockRenderedPost).toBeInTheDocument();
        expect(mockRenderedPost).toHaveTextContent(post.content!);
        expect(mockRenderedPost).toHaveTextContent(`Author: ${post.author.name}`);

      });
    });

    it("should display 'No handles' message if handles array is empty", () => {
      mockUseLoaderData.mockReturnValue({ entity: {...mockEntity, handles: []}, posts: mockRichPosts });
      render(<ReportedEntityPage />);
      expect(screen.getByText("No handles associated with this entity.")).toBeInTheDocument();
    });

    it("should display 'No posts' message if posts array is empty", () => {
      mockUseLoaderData.mockReturnValue({ entity: mockEntity, posts: [] }); // Use empty array for posts
      render(<ReportedEntityPage />);
      expect(screen.getByText("No posts found for this entity or accessible by the current user.")).toBeInTheDocument();
    });
  });

  describe("Component Rendering - Entity Not Found (from loader)", () => {
    // This tests the component's direct handling if loader somehow didn't throw but returned null entity
    // The loader is designed to throw, so this is more of a component robustness check.
    it("should render 'Entity Not Found' with Tailwind classes if entity is null", () => {
      mockUseLoaderData.mockReturnValue({ entity: null, posts: [] });
      render(<ReportedEntityPage />);
      // Check for text, but also that a key class from the styled version is present
      const headingElement = screen.getByText("Reported Entity Not Found");
      expect(headingElement).toBeInTheDocument();
      expect(headingElement).toHaveClass("text-red-600"); // Example class check
    });
  });

  describe("ErrorBoundary (with Tailwind)", () => {
    beforeEach(() => {
        mockIsRouteErrorResponse.mockImplementation((e: any) => e instanceof Response || (e && typeof e.status === 'number'));
    });

    it("should render error boundary with Card styling for thrown Response", async () => {
      const errorDataMessage = "Specific error message from loader.";
      const errorResponse = new Response(errorDataMessage, { // Loader now often throws Response with string body or JSON
        status: 404,
        statusText: "Not Found",
      });
      // Manually attach data if loader does new Response(JSON.stringify({ message: ...}))
      // (errorResponse as any).data = { message: errorDataMessage }; // if loader returns json in Response

      mockUseRouteError.mockReturnValue(errorResponse);
      // mockIsRouteErrorResponse.mockReturnValue(true); // Handled by beforeEach or specific mock if needed

      render(<ErrorBoundary />);

      // Check for Card title and content related to error
      expect(screen.getByText("Application Error")).toBeInTheDocument(); // The CardTitle for ErrorBoundary
      expect(screen.getByText(`Status: ${errorResponse.status} ${errorResponse.statusText}`)).toBeInTheDocument();
      // For string response body:
      expect(screen.getByText(`Data: ${errorDataMessage}`)).toBeInTheDocument();
      // If error.data was an object:
      // expect(screen.getByText(`Data: ${errorDataMessage}`)).toBeInTheDocument();
    });

    it("should render error boundary with Card styling for generic Error", () => {
      const errorMessage = "Something went very wrong";
      const error = new Error(errorMessage);
      mockUseRouteError.mockReturnValue(error);
      mockIsRouteErrorResponse.mockReturnValue(false);

      render(<ErrorBoundary />);
      expect(screen.getByText("Application Error")).toBeInTheDocument(); // CardTitle
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });
});
