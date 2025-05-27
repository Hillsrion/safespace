import { type ActionFunctionArgs } from "@remix-run/node";
import { requireUser } from "~/lib/auth.server.js";
import { getPostWithSpace, updatePostStatus } from "~/db/repositories/posts/actions.server";
import { getUserSpaceRole } from "~/db/repositories/spaces/queries.server";
import type { ActionResult, PostStatus } from "~/db/repositories/posts/types";

type StatusAction = 'hide' | 'unhide';

export async function action({ request, params }: ActionFunctionArgs): Promise<ActionResult<StatusAction>> {
  const { postId } = params;
  if (!postId) {
    return { success: false, error: 'Post ID is required' };
  }

  // Get the post with the author and space information
  const post = await getPostWithSpace(postId);
  if (!post) {
    return { success: false, error: 'Post not found' };
  }

  if (!post.space) {
    return { success: false, error: 'Post does not belong to a space' };
  }

  // Get the action from form data
  const formData = await request.formData();
  const action = formData.get('_action') as StatusAction | null;
  
  if (!action || (action !== 'hide' && action !== 'unhide')) {
    return { success: false, error: 'Invalid action. Must be "hide" or "unhide"' };
  }

  const user = await requireUser(request);
  
  // Check if user is admin or moderator in the space
  const userRole = await getUserSpaceRole(user.id, post.space.id);
  const isAdminOrModerator = userRole === 'ADMIN' || userRole === 'MODERATOR';
  
  if (!isAdminOrModerator) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const status: PostStatus = action === 'hide' ? 'hidden' : 'active';
    await updatePostStatus(postId, status);
    return { success: true, action };
  } catch (error) {
    console.error(`Error ${action} post:`, error);
    return { success: false, error: `Failed to ${action} post` };
  }
}
