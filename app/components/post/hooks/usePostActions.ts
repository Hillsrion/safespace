import { useState } from "react";
import { toast } from "~/hooks/use-toast";
import { usePostStore } from "~/stores/postStore";
import { usePostApi } from "~/services/api.client/posts";
import type { PostAction } from "~/services/api.client/posts";

interface UsePostActionsProps {
  postId: string;
}

type ActionStatus = "idle" | "loading" | "success" | "error";

const ACTION_LABELS: Record<PostAction, string> = {
  delete: "deleted",
  hide: "hidden",
  unhide: "unhidden",
} as const;

export function usePostActions({ postId }: UsePostActionsProps) {
  const [status, setStatus] = useState<ActionStatus>("idle");
  const { removePost, updatePostStatus: updatePostInStore } = usePostStore();
  const { deletePost, updatePostStatus } = usePostApi();

  const handlePostAction = async (action: PostAction) => {
    setStatus("loading");

    const { data, error } =
      action === "delete"
        ? await deletePost(postId)
        : await updatePostStatus(postId, action);

    if (error || !data?.success) {
      setStatus("error");
      const errorMessage = error?.message || "Failed to complete action";

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });

      setStatus("idle");
      return { success: false, error: errorMessage };
    }

    // Update local state based on action
    if (action === "delete") {
      removePost(postId);
    } else {
      updatePostInStore(postId, action === "hide" ? "hidden" : "published");
    }

    setStatus("success");

    // Show success toast
    const actionLabel = ACTION_LABELS[action];
    toast({
      title: "Success",
      description: `Post ${actionLabel} successfully`,
    });

    setStatus("idle");
    return { success: true };
  };

  return {
    handlePostAction,
    isSubmitting: status === "loading",
    status,
  } as const;
}
