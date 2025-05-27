import { MoreHorizontal, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

interface PostActionsMenuProps {
  status?: string;
  isSubmitting: boolean;
  isCurrentUserAuthor: boolean;
  currentUser: {
    role?: string;
    isSuperAdmin?: boolean;
  };
  onDeletePost?: () => void;
  onHidePost?: () => void;
  onUnhidePost?: () => void;
}

export function PostActionsMenu({
  status,
  isSubmitting,
  isCurrentUserAuthor,
  currentUser,
  onDeletePost,
  onHidePost,
  onUnhidePost,
}: PostActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-7">
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Delete action - available to admins, super admins, and post authors */}
        {((currentUser.role === "admin" || currentUser.isSuperAdmin || isCurrentUserAuthor) && onDeletePost) && (
          <DropdownMenuItem 
            onClick={onDeletePost} 
            className="text-destructive"
            disabled={isSubmitting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            <span>Supprimer le post</span>
          </DropdownMenuItem>
        )}

        {/* Toggle hide/show action - available to admins and moderators */}
        {((currentUser.role === "admin" || currentUser.role === "moderator" || currentUser.isSuperAdmin) && (onHidePost || onUnhidePost)) && (
          status === "hidden" ? (
            onUnhidePost && (
              <DropdownMenuItem 
                onClick={onUnhidePost}
                disabled={isSubmitting}
              >
                <Eye className="h-4 w-4 mr-2" />
                <span>Afficher le post</span>
              </DropdownMenuItem>
            )
          ) : (
            onHidePost && (
              <DropdownMenuItem 
                onClick={onHidePost}
                disabled={isSubmitting}
              >
                <EyeOff className="h-4 w-4 mr-2" />
                <span>Cacher le post</span>
              </DropdownMenuItem>
            )
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
