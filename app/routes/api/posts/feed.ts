import { data, type LoaderFunctionArgs } from "@remix-run/node"; // Assuming Remix, adjust if different
import {
  getAllPosts,
  getSpacePosts,
} from "~/db/repositories/posts/queries.server";
import { getCurrentUser } from "~/services/auth.server"; // To get current user
import { getUserById } from "~/db/repositories/users.server"; // To check for super admin

const DEFAULT_LIMIT = 10;

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);

  if (!user) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT;

  if (isNaN(limit) || limit <= 0) {
    return data({ error: "Invalid limit parameter" }, { status: 400 });
  }

  try {
    // Check if user is super admin
    const fullUser = await getUserById(user.id, { isSuperAdmin: true });
    let result;

    if (fullUser?.isSuperAdmin) {
      result = await getAllPosts(user.id, { cursor, limit });
    } else {
      // For regular users, fetch posts from spaces they are part of.
      // getSpacePosts expects userId and options.
      // If you need to fetch posts for specific spaces based on other criteria,
      // this logic might need adjustment or more specific parameters.
      // For a general feed, it usually gets posts from all spaces the user is a member of.
      result = await getSpacePosts(user.id, { cursor, limit });
    }

    // Ensure posts are serializable (e.g., Date objects to ISO strings)
    // Prisma typically handles this, but good to be aware.
    // The mapping to TPost happens on the client-side in the dashboard,
    // so raw Prisma objects can be returned here if they are serializable.

    return data({
      posts: result.posts,
      nextCursor: result.nextCursor,
      hasNextPage: result.hasNextPage,
    });
  } catch (error) {
    console.error("Failed to fetch posts:", error);
    return data({ error: "Failed to fetch posts" }, { status: 500 });
  }
}
