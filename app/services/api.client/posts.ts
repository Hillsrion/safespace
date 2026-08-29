import { useApi } from "~/hooks/use-api";
import { AppError } from "~/lib/error";
import { RESOURCES_API_PREFIX } from "~/lib/route-paths";
import { PaginatedPostsResponse } from "~/routes/api/posts/feed";

export type PostAction = "delete" | "hide" | "unhide";

export interface PostActionResponse {
  success: boolean;
  action?: string;
  error?: string;
  code?: string;
}

export function usePostActionsApi() {
  const { callApi, ...rest } = useApi<PostActionResponse>();

  const deletePost = async (postId: string, spaceId: string) => {
    return callApi(`/${RESOURCES_API_PREFIX}/spaces/${encodeURIComponent(spaceId)}/posts/${encodeURIComponent(postId)}`, {
      method: "DELETE",
      showErrorToast: false,
    });
  };

  const updatePostStatus = async (
    postId: string,
    action: Exclude<PostAction, "delete">
  ) => {
    const formData = new FormData();
    formData.append("_action", action as string);

    return callApi(`/${RESOURCES_API_PREFIX}/posts/${encodeURIComponent(postId)}/edit`, {
      method: "POST",
      showErrorToast: false,
      headers: {
        // Let the browser set the content-type with boundary for FormData
      },
      body: formData,
    });
  };

  const flagPost = async (postId: string, spaceId: string, reason?: string) => {
    return callApi(
      `/${RESOURCES_API_PREFIX}/spaces/${encodeURIComponent(spaceId)}/posts/${encodeURIComponent(postId)}/flag`,
      {
        method: "POST",
        showErrorToast: false,
        body: reason?.trim() ? { reason: reason.trim() } : {},
      }
    );
  };

  return {
    deletePost,
    updatePostStatus,
    flagPost,
    ...rest,
  };
}

export function usePostFeedApi() {
  const { callApi, ...rest } = useApi<PaginatedPostsResponse>();

  const getPosts = async (
    cursor: string,
    limit: number,
    spaceId?: string
  ): Promise<{
    data: PaginatedPostsResponse | null;
    error: AppError | null;
  }> => {
    const params = new URLSearchParams();
    if (cursor) {
      params.append("cursor", cursor);
    }
    if (limit) {
      params.append("limit", String(limit));
    }
    if (spaceId) {
      params.append("spaceId", spaceId);
    }
    const queryString = params.toString();

    let url = `/${RESOURCES_API_PREFIX}/posts/feed`;
    if (queryString) {
      url += `?${queryString}`;
    }

    return callApi(url, {
      method: "GET",
    });
  };

  return {
    getPosts,
    ...rest,
  };
}
