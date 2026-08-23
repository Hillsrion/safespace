import { type ActionFunctionArgs } from "react-router";
import { getCurrentUser } from "~/services/auth.server";
import {
  getPostWithSpace,
  updatePostStatus,
} from "~/db/repositories/posts/queries.server";
import { getUserSpaceRole } from "~/db/repositories/spaces/queries.server";
import type { ActionResult, PostStatus } from "~/db/repositories/posts/types";
import { requireSameOrigin } from "~/lib/security.server";
import { errorResponse } from "~/lib/api/response";

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

  // Get the post with the author and space information
  const post = await getPostWithSpace(postId);
  if (!post) {
    return errorResponse("Post not found", "not_found:api", 404);
  }

  if (!post.space) {
    return errorResponse(
      "Post does not belong to a space",
      "bad_request:api",
      400
    );
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

  // Check if user is admin or moderator in the space
  const userRole = await getUserSpaceRole(user.id, post.space.id);
  const isAdminOrModerator = userRole === "ADMIN" || userRole === "MODERATOR";

  if (!isAdminOrModerator) {
    return errorResponse(
      "You do not have permission to moderate this post",
      "forbidden:api",
      403
    );
  }

  try {
    const status: PostStatus = action === "hide" ? "hidden" : "active";
    await updatePostStatus(postId, status);
    return Response.json({ success: true, action } satisfies ActionResult<StatusAction>);
  } catch (error) {
    console.error(`Error ${action} post:`, error);
    return errorResponse(
      `Failed to ${action} post`,
      "server_error:api",
      500
    );
  }
}
