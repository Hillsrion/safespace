import { data, type LoaderFunctionArgs } from "@remix-run/node";
import { createError } from "~/lib/error/parse";
import {
  getAllPosts,
  getSpacePosts,
} from "~/db/repositories/posts/queries.server";
import { getCurrentUser } from "~/services/auth.server";
import { getUserById } from "~/db/repositories/users.server";
import type { Post } from "~/generated/prisma";
import { POSTS_PAGE_LIMIT } from "~/lib/constants";

export type PaginatedPostsResponse = {
  posts: Post[];
  nextCursor?: string | null;
  hasNextPage: boolean;
  error?: string;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);

  if (!user) {
    const error = createError(
      "You must be logged in to view posts",
      "unauthorized:auth",
      401
    );
    return data({ error }, { status: error.status });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : POSTS_PAGE_LIMIT;

  if (isNaN(limit) || limit <= 0) {
    const error = createError(
      "Invalid limit parameter. Must be a positive number",
      "bad_request:api",
      400,
      { limit: limitParam }
    );
    return data({ error: error }, { status: error.status });
  }

  try {
    // Check if user is super admin
    const fullUser = await getUserById(user.id, { isSuperAdmin: true });
    let result;

    if (fullUser?.isSuperAdmin) {
      result = await getAllPosts(user.id, { cursor, limit });
    } else {
      // For regular users, fetch posts from spaces they are part of
      result = await getSpacePosts(user.id, { cursor, limit });
    }

    return data({
      posts: result.posts,
      nextCursor: result.nextCursor,
      hasNextPage: result.hasNextPage,
    } satisfies PaginatedPostsResponse);
  } catch (error) {
    console.error("Failed to fetch posts:", error);
    const customError = createError(
      "Unable to load posts. Please try again later.",
      "server_error:posts",
      500,
      { cursor, limit, userId: user.id }
    );
    return data({ error: customError }, { status: customError.status });
  }
}
