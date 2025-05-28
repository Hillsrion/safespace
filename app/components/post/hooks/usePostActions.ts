import { useState } from "react";
import { toast } from "~/hooks/use-toast";

type PostAction = "delete" | "hide" | "unhide";

interface UsePostActionsProps {
  postId: string;
  onDeletePost?: (id: string) => void;
  onHidePost?: (id: string) => void;
  onUnhidePost?: (id: string) => void;
}

export function usePostActions({
  postId,
  onDeletePost,
  onHidePost,
  onUnhidePost,
}: UsePostActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePostAction = async (action: PostAction) => {
    try {
      setIsSubmitting(true);
      const endpoint =
        action === "delete"
          ? `resources/api/posts/${postId}/delete`
          : `resources/api/posts/${postId}/edit`;

      const formData = new FormData();
      if (action !== "delete") {
        formData.append("_action", action);
      }

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const result = (await response.json()) as {
        success: boolean;
        action?: string;
        error?: string;
      };

      if (!result || !result.success) {
        throw new Error(result?.error || "Action failed");
      }

      // Call the appropriate callback if provided
      if (action === "delete" && onDeletePost) {
        onDeletePost(postId);
      } else if (action === "hide" && onHidePost) {
        onHidePost(postId);
      } else if (action === "unhide" && onUnhidePost) {
        onUnhidePost(postId);
      }

      toast({
        title: `Post ${action}ed successfully`,
        description: `Post ${action}ed successfully`,
      });
      return { success: true };
    } catch (error: unknown) {
      console.error(`Error ${action}ing post:`, error);
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        title: `Failed to ${action} post`,
        description: `Failed to ${action} post: ${errorMessage}`,
        variant: "destructive",
      });
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    handlePostAction,
    isSubmitting,
  };
}
