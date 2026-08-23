import type { ActionFunctionArgs } from "react-router";
import { createReport } from "~/db/repositories/posts/write.server";
import { HttpError, errors } from "~/lib/api/http-error";
import { errorResponse } from "~/lib/api/response";
import { createReportSchema } from "~/lib/reports";
import { requireSameOrigin } from "~/lib/security.server";
import { requireUser } from "~/services/auth.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "POST") {
      const response = errorResponse(
        "Method not allowed",
        "bad_request:api",
        405
      );
      response.headers.set("Allow", "POST");
      return response;
    }

    const user = await requireUser(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw errors.badRequest("A valid JSON body is required");
    }

    const parsed = createReportSchema.safeParse(body);
    if (!parsed.success) {
      throw errors.badRequest(
        "Invalid report payload",
        "bad_request:api",
        parsed.error.flatten()
      );
    }

    return Response.json(await createReport(user, parsed.data), { status: 201 });
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    console.error("Failed to create report", error);
    return errorResponse(
      "Failed to create report",
      "server_error:api",
      500
    );
  }
}
