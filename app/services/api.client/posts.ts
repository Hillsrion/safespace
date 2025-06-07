import { useApi } from "~/hooks/use-api";
import { API_BASE_URL } from "~/lib/constants";

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

  return {
    deletePost,
    updatePostStatus,
    ...rest,
  };
}
