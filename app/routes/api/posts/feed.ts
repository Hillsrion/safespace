import { type LoaderFunctionArgs } from "@remix-run/node";
import { errors } from "~/lib/api/http-error";
import { data } from "@remix-run/node";
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
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw errors.unauthorized("You must be logged in to view posts");
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : POSTS_PAGE_LIMIT;

  if (isNaN(limit) || limit <= 0) {
    throw errors.badRequest(
      "Invalid limit parameter. Must be a positive number",
      "bad_request:api",
      { limit: limitParam }
    );
  }

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
}
