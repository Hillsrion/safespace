import { type ActionFunctionArgs } from "react-router";
import { getCurrentUser } from "~/services/auth.server";
import {
  deletePost,
} from "~/db/repositories/posts/queries.server";
import type { ActionResult } from "~/db/repositories/posts/types";
import type { AppError } from '~/lib/error/types';
import { errorResponse } from '~/lib/api/response';
import { requireSameOrigin } from "~/lib/security.server";

export async function action({
  request,
  params,
}: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    const { id: postId } = params;
    if (!postId) {
      return errorResponse(
        'Post ID is required',
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

    await deletePost(postId, user.id);
    
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
