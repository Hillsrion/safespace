import { useState } from "react";
import { toast } from "~/hooks/use-toast";
import { usePostStore } from "~/stores/postStore";
import { usePostActionsApi } from "~/services/api.client/posts";
import type { PostAction } from "~/services/api.client/posts";

interface UsePostActionsProps {
  postId: string;
  spaceId?: string;
}

type ActionStatus = "idle" | "loading" | "success" | "error";

const ACTION_LABELS: Record<PostAction, string> = {
  delete: "deleted",
  hide: "hidden",
  unhide: "unhidden",
} as const;

export function usePostActions({ postId, spaceId }: UsePostActionsProps) {
  const [status, setStatus] = useState<ActionStatus>("idle");
  const { removePost, updatePostStatus: updatePostInStore } = usePostStore();
  const { deletePost, flagPost, updatePostStatus } = usePostActionsApi();

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

  const handleFlagPost = async (reason?: string) => {
    if (!spaceId) return { success: false, error: "Espace introuvable" };
    setStatus("loading");
    const { data, error } = await flagPost(postId, spaceId, reason);
    setStatus("idle");

    if (error || !data?.success) {
      const errorMessage = error?.message || "Impossible de signaler ce rapport";
      toast({ title: "Erreur", description: errorMessage, variant: "destructive" });
      return { success: false, error: errorMessage };
    }

    toast({
      title: "Signalement transmis",
      description: "L’équipe de modération examinera ce rapport.",
    });
    return { success: true };
  };

  return {
    handlePostAction,
    handleFlagPost,
    isSubmitting: status === "loading",
    status,
  } as const;
}
