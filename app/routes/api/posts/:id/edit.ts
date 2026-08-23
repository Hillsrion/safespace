import { type ActionFunctionArgs } from "react-router";
import { getCurrentUser } from "~/services/auth.server";
import {
  updatePostStatus,
} from "~/db/repositories/posts/queries.server";
import type { ActionResult, PostStatus } from "~/db/repositories/posts/types";
import { requireSameOrigin } from "~/lib/security.server";
import { errorResponse } from "~/lib/api/response";
import { HttpError } from "~/lib/api/http-error";

type StatusAction = "hide" | "unhide";

export async function action({
  request,
  params,
}: ActionFunctionArgs) {
  requireSameOrigin(request);
  const { id: postId } = params;
  if (!postId) {
    return errorResponse("Post ID is required", "bad_request:api", 400);
  }

  const user = await getCurrentUser(request);
  if (!user) {
    return errorResponse("Authentication required", "unauthorized:api", 401);
  }

  // Get the action from form data
  const formData = await request.formData();
  const action = formData.get("_action") as StatusAction | null;

  if (!action || (action !== "hide" && action !== "unhide")) {
    return errorResponse(
      'Invalid action. Must be "hide" or "unhide"',
      "bad_request:api",
      400
    );
  }

  try {
    const status: PostStatus = action === "hide" ? "hidden" : "active";
    await updatePostStatus(postId, status, user.id);
    return Response.json({ success: true, action } satisfies ActionResult<StatusAction>);
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    console.error(`Error ${action} post:`, error);
    return errorResponse(
      `Failed to ${action} post`,
      "server_error:api",
      500
    );
  }
}
