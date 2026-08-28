import { type ActionFunctionArgs } from "react-router";

import { deletePost } from "~/db/repositories/posts/queries.server";
import type { ActionResult } from "~/db/repositories/posts/types";
import { errorResponse } from "~/lib/api/response";
import { logServerException } from "~/lib/error/server-error.server";
import type { AppError } from "~/lib/error/types";
import { publicMessageForStatus } from "~/lib/error/public";
import { reportIdSchema } from "~/lib/reports";
import { requireSameOrigin } from "~/lib/security.server";
import { getCurrentUser } from "~/services/auth.server";

export async function deletePostAction({ request, params }: ActionFunctionArgs) {
  try {
    if (request.method.toUpperCase() !== "DELETE") {
      const response = errorResponse("Method not allowed", "bad_request:api", 405);
      response.headers.set("Allow", "DELETE");
      return response;
    }

    requireSameOrigin(request);
    const parsedPostId = reportIdSchema.safeParse(params.id);
    if (!parsedPostId.success) {
      return errorResponse("Invalid post ID", "bad_request:api", 400);
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return errorResponse("Authentication required", "unauthorized:api", 401);
    }

    await deletePost(parsedPostId.data, user.id);
    return new Response(
      JSON.stringify({ success: true, action: "deleted" as const } as ActionResult<"deleted">),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    if (error && typeof error === "object" && "status" in error && "code" in error && "message" in error) {
      const typedError = error as { status: number; code: string; message: string };
      return errorResponse(
        publicMessageForStatus(typedError.status),
        typedError.code as AppError["code"],
        typedError.status
      );
    }

    logServerException(error, {
      operation: "post.delete",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
    return errorResponse("An unexpected error occurred", "server_error:api", 500);
  }
}
