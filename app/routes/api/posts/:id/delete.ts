import { type ActionFunctionArgs } from "@remix-run/node";
import { getCurrentUser } from "~/services/auth.server";
import {
  deletePost,
  getPostWithSpace,
} from "~/db/repositories/posts/queries.server";
import { getUserSpaceRole } from "~/db/repositories/spaces/queries.server";
import type { ActionResult } from "~/db/repositories/posts/types";
import { createError } from '~/lib/error/parse';
import type { AppError } from '~/lib/error/types';
import { errorResponse } from '~/lib/api/response';

export async function action({
  request,
  params,
}: ActionFunctionArgs) {
  try {
    const { id: postId } = params;
    if (!postId) {
      return errorResponse(
        'Post ID is required',
        'bad_request:api',
        400
      );
    }

    // Get the post with the author and space information
    const post = await getPostWithSpace(postId);
    if (!post) {
      return errorResponse(
        'Post not found',
        'not_found:api',
        404
      );
    }

    if (!post.space) {
      return errorResponse(
        'Post does not belong to a space',
        'bad_request:api',
        400
      );
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return errorResponse(
        'Authentication required',
        'unauthorized:api',
        401
      );
    }

    const isAuthor = post.authorId === user.id;

    // Only allow delete if user is the author or has admin/moderator role
    if (!isAuthor) {
      const userRole = await getUserSpaceRole(user.id, post.space.id);
      const isAdminOrModerator = userRole === "ADMIN" || userRole === "MODERATOR";

      if (!isAdminOrModerator) {
        return errorResponse(
          'You do not have permission to delete this post',
          'forbidden:api',
          403
        );
      }
    }

    await deletePost(postId);
    
    return new Response(
      JSON.stringify({
        success: true,
        action: 'deleted' as const
      } as ActionResult<'deleted'>),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    console.error("Error in delete post action:", error);
    
    // If it's one of our custom errors, return it with the proper status
    if (error && typeof error === 'object' && 'status' in error && 'code' in error && 'message' in error) {
      const typedError = error as { status: number; code: string; message: string };
      return errorResponse(
        typedError.message,
        typedError.code as AppError['code'],
        typedError.status
      );
    }
    
    // For unexpected errors, return a 500
    return errorResponse(
      'An unexpected error occurred',
      'server_error:api',
      500
    );
  }
}
