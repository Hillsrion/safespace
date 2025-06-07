import { useState } from "react";
import { toast } from "~/hooks/use-toast";
import { usePostStore } from "~/stores/postStore";
import {
  deletePost,
  updatePostStatus,
  type PostAction,
} from "~/services/api.client/posts";

interface UsePostActionsProps {
  postId: string;
}

export function usePostActions({ postId }: UsePostActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { removePost, updatePostStatus: updatePostInStore } = usePostStore();

  const handlePostAction = async (action: PostAction) => {
    try {
      setIsSubmitting(true);

      const result =
        action === "delete"
          ? await deletePost(postId)
          : await updatePostStatus(postId, action);

      if (!result.success) {
        throw new Error(result?.error || "Action failed");
      }

      if (action === "delete") {
        removePost(postId);
      } else if (action === "hide") {
        updatePostInStore(postId, "hidden");
      } else if (action === "unhide") {
        updatePostInStore(postId, "published");
      }

      toast({
        title: `Post ${action}d successfully`,
        variant: "default",
      });
      return { success: true };
    } catch (error) {
      console.error(`Error ${action}ing post:`, error);
      toast({
        title: `Failed to ${action} post`,
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "An unknown error occurred",
      };
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    handlePostAction,
    isSubmitting,
  };
}
