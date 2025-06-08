import type { Post as PrismaPost } from "~/generated/prisma";
import { useApi } from "~/hooks/use-api";
import { RESOURCES_API_PREFIX } from "~/routes";

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
    return callApi(`${RESOURCES_API_PREFIX}/posts/${postId}/delete`, {
      method: "POST",
    });
  };

  const updatePostStatus = async (
    postId: string,
    action: Omit<PostAction, "delete">
  ) => {
    const formData = new FormData();
    formData.append("_action", action as string);

    return callApi(`${RESOURCES_API_PREFIX}/posts/${postId}/edit`, {
      method: "POST",
      headers: {
        // Let the browser set the content-type with boundary for FormData
      },
      body: formData,
    });
  };

  const getPosts = async (cursor?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (cursor) {
      params.append("cursor", cursor);
    }
    if (limit) {
      params.append("limit", String(limit));
    }
    const queryString = params.toString();

    let url = `${RESOURCES_API_PREFIX}/posts/feed`;
    if (queryString) {
      url += `?${queryString}`;
    }

    return callApi(url, {
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
