import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, Response } from "@remix-run/node"; // Added Response for throwing
import { useLoaderData, useParams, useRouteError, isRouteErrorResponse } from "@remix-run/react"; // Added useRouteError, isRouteErrorResponse
import type { ReportedEntityWithHandles, ReportedEntityPost } from "~/db/repositories/reportedEntities/types"; // Renamed FetchedReportedEntityPost back
import { reportedEntityRepository } from "~/db/repositories/reportedEntities/index.server";
import { requireUserId } from "~/services/auth.server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Post as PostComponent } from "~/components/post";
import type { TPost } from "~/lib/types"; // Only TPost is needed from here now

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { id: entityId } = params;

  if (!entityId) {
    // This case might be unlikely if route matching is strict, but good for safety.
    throw new Response("Reported Entity ID is required.", { status: 400 });
  }

  try {
    // Fetch the entity first
    const entity = await reportedEntityRepository.getById(entityId);
    if (!entity) {
      throw new Response("Reported entity not found.", { status: 404 });
    }

    // Then fetch posts, requiring userId
    const userId = await requireUserId(request); // Throws Response if not authenticated
    const posts = await reportedEntityRepository.getPosts(entityId, userId);

    return json({ entity, posts });
  } catch (error) {
    console.error("Error in ReportedEntity loader:", error);

    // If requireUserId throws a Response, or we throw one, re-throw it
    if (error instanceof Response) {
      throw error;
    }

    // Handle "User not found" error from getPosts (if it's a specific error type we want to expose)
    // This depends on the actual error thrown by getReportedEntityPosts if the user is not found
    // For now, let's assume it might throw an error with a specific message.
    if (error instanceof Error && error.message === "User not found") {
        throw new Response("User not found.", { status: 404 });
    }

    // Generic error for other cases
    throw new Response("Error loading reported entity page.", { status: 500 });
  }
}

// The mapFetchedPostToTPost function is now removed.
// We expect `posts` from the loader to be directly compatible with `TPost`
// or require minimal, safe casting if the generated `ReportedEntityPost` type
// is structurally identical but nominally different.

export default function ReportedEntityPage() {
  const { entity, posts } = useLoaderData<typeof loader>(); // Renamed back to posts
  const params = useParams();

  if (!entity) {
    return (
      <div className="container mx-auto p-4 text-center">
        <h1 className="text-2xl font-bold text-red-600">Reported Entity Not Found</h1>
        <p className="text-gray-500">No entity found with ID: {params.id}</p>
      </div>
    );
  }

  // No transformation needed here anymore if ReportedEntityPost aligns with TPost
  // const transformedPosts = posts.map(p => mapFetchedPostToTPost(p, entity));

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-2xl font-bold md:text-3xl">
            {entity.name || `Entity Details`}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500">
            ID: {entity.id}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <h3 className="text-lg font-semibold mb-2 text-gray-700">Handles:</h3>
          {entity.handles && entity.handles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {entity.handles.map((handle) => (
                <Badge key={handle.id} variant="secondary">
                  {handle.platform ? `${handle.platform}: ${handle.handle}` : handle.handle}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic">No handles associated with this entity.</p>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Associated Posts</h2>
        {posts && posts.length > 0 ? (
          <div className="space-y-6"> {/* Increased space between posts for clarity */}
            {posts.map((post) => (
              // Assuming `post` (of type ReportedEntityPost) is now directly compatible with TPost's props
              // If PostComponent expects a single prop like `postData={post}`, adjust accordingly.
              // Based on TPost definition and PostComponent props, spreading is correct.
              <PostComponent key={post.id} {...(post as unknown as TPost)} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic text-center py-4">
            No posts found for this entity or accessible by the current user.
          </p>
        )}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const params = useParams();

  // Using Tailwind classes for ErrorBoundary styling
  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <Card className="bg-red-50 border-red-500">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-red-700">Application Error</CardTitle>
        </CardHeader>
        <CardContent className="text-red-600">
          {isRouteErrorResponse(error) ? (
            <>
              <p className="font-semibold">Status: {error.status} {error.statusText}</p>
              <p>Data: {typeof error.data === 'string' ? error.data : error.data?.message || JSON.stringify(error.data)}</p>
            </>
          ) : (
            <p>{error instanceof Error ? error.message : "An unknown error occurred."}</p>
          )}
          <p className="mt-2">Failed to load data for entity ID: {params.id}.</p>
        </CardContent>
      </Card>
    </div>
  );
}
