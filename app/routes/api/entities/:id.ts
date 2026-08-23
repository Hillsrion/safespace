import { data, type LoaderFunctionArgs } from "react-router";
import { reportedEntityRepository } from "~/db/repositories/reportedEntities/index.server";
import { requireUserId } from "~/services/auth.server";
import { errors } from "~/lib/api/http-error"; // Import custom errors utility
import { HttpError } from "~/lib/api/http-error"; // Import HttpError for instanceof check

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const userId = await requireUserId(request);

    const { id } = params;

    if (!id) {
      throw errors.badRequest(
        "Reported entity ID is required",
        "bad_request:api"
      );
    }

    const reportedEntity = await reportedEntityRepository.getAccessibleById(id, userId);

    if (!reportedEntity) {
      throw errors.notFound(
        "Reported entity not found",
        "not_found:reported_entity"
      );
    }

    return data(reportedEntity);
  } catch (error) {
    console.error("Error in API /api/entities/:id :", error);
    if (error instanceof HttpError) {
      // If it's already an HttpError from our utility (or requireUser), re-throw it
      throw error;
    }
    // For any other unexpected errors
    throw errors.internalServerError(
      "An unexpected error occurred while fetching the reported entity."
    );
  }
}
