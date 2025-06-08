import type { Post as PrismaPost } from "~/generated/prisma";
import { useApi } from "~/hooks/use-api";
import { API_BASE_URL } from "~/lib/constants";

export interface PaginatedPostsResponse {
  posts: PrismaPost[];
  nextCursor?: string | null;
  hasNextPage: boolean;
  error?: string;
}

export type PostAction = "delete" | "hide" | "unhide";

export interface PostActionResponse {
  success: boolean;
  action?: string;
  error?: string;
  code?: string;
}

export function usePostApi() {
  const { callApi, ...rest } = useApi<PostActionResponse>();

  const deletePost = async (postId: string) => {
    return callApi(`${API_BASE_URL}/posts/${postId}/delete`, {
      method: "POST",
    });
  };

  const updatePostStatus = async (
    postId: string,
    action: Omit<PostAction, "delete">
  ) => {
    const formData = new FormData();
    formData.append("_action", action as string);

    return callApi(`${API_BASE_URL}/posts/${postId}/edit`, {
      method: "POST",
      headers: {
        // Let the browser set the content-type with boundary for FormData
      },
      body: formData,
    });
  };

  const getPosts = async (cursor?: string, limit?: number): Promise<PaginatedPostsResponse> => {
    const params = new URLSearchParams();
    if (cursor) {
      params.append("cursor", cursor);
    }
    if (limit) {
      params.append("limit", String(limit));
    }
    const queryString = params.toString();

    // API_BASE_URL is likely just "/api" or similar.
    // The new route is mounted at /api/posts, so the path for callApi will be "/posts" relative to API_BASE_URL
    // or if API_BASE_URL is empty, then "/api/posts"
    // Assuming API_BASE_URL = "/api", then the path should be "/posts"
    // If API_BASE_URL = "", then path should be "/api/posts"
    // The existing calls are like `${API_BASE_URL}/posts/${postId}/delete`
    // So if API_BASE_URL = "/api", then this becomes "/api/posts/...".
    // Thus, for the new route /api/posts, the path given to callApi should be "/posts"
    // if API_BASE_URL is "/api".
    // Let's assume API_BASE_URL is "/api" as it's common in Remix setups.
    // So, the endpoint is API_BASE_URL + "/posts" which becomes "/api/posts"

    let url = `${API_BASE_URL}/posts`;
    if (queryString) {
      url += `?${queryString}`;
    }

    return callApi<PaginatedPostsResponse>(url, {
      method: "GET",
    });
  };

  return {
    deletePost,
    updatePostStatus,
    getPosts,
    ...rest,
  };
}
