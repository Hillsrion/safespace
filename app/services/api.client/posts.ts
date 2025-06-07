export type PostAction = "delete" | "hide" | "unhide";

export interface PostActionResponse {
  success: boolean;
  action?: string;
  error?: string;
}

export async function deletePost(postId: string): Promise<PostActionResponse> {
  const response = await fetch(`/resources/api/posts/${postId}/delete`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export async function updatePostStatus(
  postId: string,
  action: Omit<PostAction, 'delete'>
): Promise<PostActionResponse> {
  const formData = new FormData();
  formData.append("_action", action as string);

  const response = await fetch(`/resources/api/posts/${postId}/edit`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}
