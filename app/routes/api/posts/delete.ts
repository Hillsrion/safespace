import { type ActionFunctionArgs } from "@remix-run/node";
import { getCurrentUser } from "~/services/auth.server";
import {
  deletePost,
  getPostWithSpace,
} from "~/db/repositories/posts/queries.server";
import { getUserSpaceRole } from "~/db/repositories/spaces/queries.server";
import type { ActionResult } from "~/db/repositories/posts/types";

export async function action({
  request,
  params,
}: ActionFunctionArgs): Promise<ActionResult<"deleted">> {
  const { postId } = params;
  if (!postId) {
    return { success: false, error: "Post ID is required" };
  }

  // Get the post with the author and space information
  const post = await getPostWithSpace(postId);
  if (!post) {
    return { success: false, error: "Post not found" };
  }

  if (!post.space) {
    return { success: false, error: "Post does not belong to a space" };
  }

  const user = await getCurrentUser(request);
  if (!user) {
    return { success: false, error: "User not found" };
  }
  const isAuthor = post.authorId === user.id;

  // Only allow delete if user is the author or has admin/moderator role
  if (!isAuthor) {
    const userRole = await getUserSpaceRole(user.id, post.space.id);
    const isAdminOrModerator = userRole === "ADMIN" || userRole === "MODERATOR";

    if (!isAdminOrModerator) {
      return { success: false, error: "Unauthorized" };
    }
  }

  try {
    await deletePost(postId);
    return { success: true, action: "deleted" };
  } catch (error) {
    console.error("Error deleting post:", error);
    return { success: false, error: "Failed to delete post" };
  }
}
