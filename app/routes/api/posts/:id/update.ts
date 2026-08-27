import type { ActionFunctionArgs } from "react-router";
import { updateReport } from "~/db/repositories/posts/write.server";
import { HttpError, errors } from "~/lib/api/http-error";
import { logServerException } from "~/lib/error/server-error.server";
import { errorResponse } from "~/lib/api/response";
import { reportIdSchema, updateReportSchema } from "~/lib/reports";
import { requireSameOrigin } from "~/lib/security.server";
import { requireUser } from "~/services/auth.server";

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "PATCH") {
      const response = errorResponse(
        "Method not allowed",
        "bad_request:api",
        405
      );
      response.headers.set("Allow", "PATCH");
      return response;
    }
    if (!params.id) throw errors.badRequest("Post ID is required");
    const parsedPostId = reportIdSchema.safeParse(params.id);
    if (!parsedPostId.success) throw errors.badRequest("Invalid post ID");

    const user = await requireUser(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw errors.badRequest("A valid JSON body is required");
    }

    const parsed = updateReportSchema.safeParse(body);
    if (!parsed.success) {
      throw errors.badRequest(
        "Invalid report payload",
        "bad_request:api",
        parsed.error.flatten()
      );
    }

    return Response.json(
      await updateReport(parsedPostId.data, user, parsed.data)
    );
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    logServerException(error, {
      operation: "post.update",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
    return errorResponse(
      "Failed to update report",
      "server_error:api",
      500
    );
  }
}
