import { useRef, useState } from "react";
import { useRevalidator } from "react-router";
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
  delete: "supprimé",
  hide: "masqué",
  unhide: "réaffiché",
} as const;

export function usePostActions({ postId, spaceId }: UsePostActionsProps) {
  const [status, setStatus] = useState<ActionStatus>("idle");
  const busyRef = useRef(false);
  const { revalidate } = useRevalidator();
  const { removePost, updatePostStatus: updatePostInStore } = usePostStore();
  const { deletePost, flagPost, updatePostStatus } = usePostActionsApi();

  const handlePostAction = async (action: PostAction) => {
    if (action === "delete" && !spaceId) {
      return { success: false, error: "Espace introuvable" };
    }
    if (busyRef.current) {
      return { success: false, error: "Une action est déjà en cours" };
    }
    busyRef.current = true;
    setStatus("loading");

    try {
      const { data, error } =
        action === "delete"
          ? await deletePost(postId, spaceId!)
          : await updatePostStatus(postId, action);

      if (error || !data?.success) {
        const errorMessage = "Impossible de terminer cette action";
        setStatus("error");
        toast({ title: "Erreur", description: errorMessage, variant: "destructive" });
        return { success: false, error: errorMessage };
      }

      if (action === "delete") {
        removePost(postId);
      } else {
        updatePostInStore(postId, action === "hide" ? "hidden" : "published");
      }

      try {
        await revalidate();
        toast({
          title: "Succès",
          description: `Rapport ${ACTION_LABELS[action]} avec succès`,
        });
      } catch {
        // The mutation already committed. A refresh failure must not turn it
        // into a retryable-looking mutation failure.
        toast({
          title: "Action enregistrée",
          description: "Action enregistrée, actualisez la page si nécessaire.",
        });
      }
      setStatus("success");
      return { success: true };
    } catch {
      const errorMessage = "Impossible de terminer cette action";
      setStatus("error");
      toast({ title: "Erreur", description: errorMessage, variant: "destructive" });
      return { success: false, error: errorMessage };
    } finally {
      busyRef.current = false;
      setStatus("idle");
    }
  };

  const handleFlagPost = async (reason?: string) => {
    if (!spaceId) return { success: false, error: "Espace introuvable" };
    if (busyRef.current) {
      return { success: false, error: "Une action est déjà en cours" };
    }
    busyRef.current = true;
    setStatus("loading");
    try {
      const { data, error } = await flagPost(postId, spaceId, reason);
      if (error || !data?.success) {
        const errorMessage = "Impossible de signaler ce rapport";
        toast({ title: "Erreur", description: errorMessage, variant: "destructive" });
        return { success: false, error: errorMessage };
      }

      toast({
        title: "Signalement transmis",
        description: "L’équipe de modération examinera ce rapport.",
      });
      return { success: true };
    } catch {
      const errorMessage = "Impossible de signaler ce rapport";
      toast({ title: "Erreur", description: errorMessage, variant: "destructive" });
      return { success: false, error: errorMessage };
    } finally {
      busyRef.current = false;
      setStatus("idle");
    }
  };

  return {
    handlePostAction,
    handleFlagPost,
    isSubmitting: status === "loading",
    status,
  } as const;
}
