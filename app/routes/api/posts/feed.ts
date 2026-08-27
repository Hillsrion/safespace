import { type LoaderFunctionArgs } from "react-router";
import { errors } from "~/lib/api/http-error";
import { data } from "react-router";
import {
  getAllPosts,
  getSpacePosts,
} from "~/db/repositories/posts/queries.server";
import type { PostViewerPermissions } from "~/db/repositories/posts/queries.server";
import { getCurrentUser } from "~/services/auth.server";
import { getUserById } from "~/db/repositories/users.server";
import type { Post } from "~/generated/prisma";
import { POSTS_PAGE_LIMIT } from "~/lib/constants";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export type PaginatedPostsResponse = {
  posts: Array<Post & PostViewerPermissions>;
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
  const limit = limitParam ? Number(limitParam) : POSTS_PAGE_LIMIT;
  const spaceId = url.searchParams.get("spaceId") || undefined;

  if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
    throw errors.badRequest(
      "Invalid limit parameter. Must be between 1 and 100",
      "bad_request:api",
      { limit: limitParam }
    );
  }
  if (spaceId && !uuidSchema.safeParse(spaceId).success) {
    throw errors.badRequest("Invalid spaceId parameter");
  }
  if (cursor && !uuidSchema.safeParse(cursor).success) {
    throw errors.badRequest("Invalid cursor parameter");
  }

  // Check if user is super admin
  const fullUser = await getUserById(user.id, { isSuperAdmin: true });
  let result;

  if (fullUser?.isSuperAdmin) {
    result = await getAllPosts(user.id, { cursor, limit, spaceId });
  } else {
    // For regular users, fetch posts from spaces they are part of
    result = await getSpacePosts(user.id, { cursor, limit, spaceId });
  }

  return data({
    posts: result.posts,
    nextCursor: result.nextCursor,
    hasNextPage: result.hasNextPage,
  } satisfies PaginatedPostsResponse);
}
