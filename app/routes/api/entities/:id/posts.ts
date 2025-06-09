import type { LoaderFunctionArgs } from "@remix-run/node";
import { data } from "@remix-run/node"; // Using data for success
import { reportedEntityRepository } from "~/db/repositories/reportedEntities/index.server";
import { requireUserId } from "~/services/auth.server";
import { errors } from "~/lib/api/http-error"; // Import custom errors utility
import { HttpError } from "~/lib/api/http-error"; // Import HttpError for instanceof check

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const userId = await requireUserId(request); // Might throw HttpError

    const { id: reportedEntityId } = params;

    if (!reportedEntityId) {
      throw errors.badRequest("Reported entity ID is required");
    }

    // Check if the parent ReportedEntity exists first
    const reportedEntity = await reportedEntityRepository.getById(reportedEntityId);
    if (!reportedEntity) {
      // Use a specific error code if available, or the default not_found:api
      throw errors.notFound("Reported entity not found", "not_found:reported_entity");
    }

    // Now fetch the posts
    // The repository's getPosts might throw its own errors (e.g., if user is not found after auth)
    // For this example, we'll assume if it throws a generic Error for "User not found", we catch it.
    const posts = await reportedEntityRepository.getPosts(
      reportedEntityId,
      userId
    );

    return data(posts);
  } catch (error) {
    console.error("Error in API /api/entities/:id/posts :", error);
    if (error instanceof HttpError) {
      // If it's already an HttpError from our utility (or requireUserId), re-throw it
      throw error;
    }
    // Specific handling for "User not found" from the repository layer, if it's not an HttpError already
    if (error instanceof Error && error.message === "User not found") {
      throw errors.notFound("User not found for posts query", "not_found:user");
    }
    // For any other unexpected errors
    throw errors.internalServerError("An unexpected error occurred while fetching posts for the reported entity.");
  }
}
