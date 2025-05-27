import * as React from "react";
import { usePostActions } from "~/components/post/hooks/usePostActions";
import { MediaDialog } from "~/components/media-dialog";
import { MediaCarousel } from "~/components/media-carousel";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "~/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { MoreHorizontal, Trash2, Eye, EyeOff } from "lucide-react"; // Icons for actions
import { Link, useFetcher } from "react-router-dom";
import { toast } from "sonner";
import { 
  type PostComponentProps, 
  type AuthorProfile, 
  type EvidenceMedia, 
  type ReportedUserInfo, 
  type SpaceInfo 
} from "~/lib/types";


export function Post({
  id,
  author,
  createdAt,
  content,
  media,
  status,
  reportedUserInfo,
  space,
  currentUser,
  onDeletePost,
  onHidePost,
  onUnhidePost,
}: PostComponentProps) {
  const [isMediaDialogOpen, setIsMediaDialogOpen] = React.useState(false);
  const [selectedMediaIndex, setSelectedMediaIndex] = React.useState(0);
  
  const { handlePostAction, isSubmitting } = usePostActions({
    postId: id,
    onDeletePost,
    onHidePost,
    onUnhidePost
  });

  const handleMediaClick = (index: number) => {
    setSelectedMediaIndex(index);
    setIsMediaDialogOpen(true);
  };

  const isCurrentUserAuthor = author.id === currentUser.id;

  const getStatusBadge = () => {
    if (!status || status === "published") return null;

    let variant: "destructive" | "secondary" | "outline" | "default" = "default";
    let text = "";

    switch (status) {
      case "hidden":
        variant = "destructive";
        text = "Caché";
        break;
      case "admin_only":
        variant = "secondary";
        text = "Admin Seulement";
        break;
      case "pending_review":
        variant = "outline";
        text = "En Attente";
        break;
      default:
        return null; 
    }
    return <Badge variant={variant} className="mr-2">{text}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex items-center space-x-3">
          <Avatar>
            <AvatarImage src={author.avatarUrl} alt={author.name} />
            <AvatarFallback>{author.name ? author.name.charAt(0) : 'U'}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="font-semibold">{author.name}</span>
              <span className="text-sm text-muted-foreground">@{author.username}</span>
              <span className="text-lg text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground">
                {new Intl.DateTimeFormat("fr-FR", { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(createdAt))}
              </span>
            </div>
            <div>
              {author.role === "admin" && <Badge variant="outline" className="mr-1">Administrateur</Badge>}
              {author.role === "moderator" && <Badge variant="outline">Modérateur</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center">
          {getStatusBadge()}
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
                  onClick={() => handlePostAction('delete')} 
                  className="text-destructive"
                  disabled={isSubmitting}
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Supprimer le post</span>
                </DropdownMenuItem>
              )}

              {/* Toggle hide/show action - available to admins and moderators */}
              {((currentUser.role === "admin" || currentUser.role === "moderator" || currentUser.isSuperAdmin) && (onHidePost || onUnhidePost)) && (
                status === "hidden" ? (
                  onUnhidePost && (
                    <DropdownMenuItem 
                      onClick={() => handlePostAction('unhide')}
                      disabled={isSubmitting}
                    >
                      <Eye className="h-4 w-4" />
                      <span>Afficher le post</span>
                    </DropdownMenuItem>
                  )
                ) : (
                  onHidePost && (
                    <DropdownMenuItem 
                      onClick={() => handlePostAction('hide')}
                      disabled={isSubmitting}
                    >
                      <EyeOff className="h-4 w-4" />
                      <span>Masquer le post</span>
                    </DropdownMenuItem>
                  )
                )
              )}

              {/* Fallback when no actions are available */}
              {!((currentUser.role === "admin" || currentUser.role === "moderator" || currentUser.isSuperAdmin || isCurrentUserAuthor) && 
                 (onDeletePost || onHidePost || onUnhidePost)) && (
                <DropdownMenuItem disabled>
                  <span>Aucune action disponible</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="prose prose-p:mb-4 prose-p:whitespace-pre-wrap">
        <p>{content}</p>
        
        {media && media.length > 0 && (
          <div className="mb-4">
            <MediaCarousel 
              media={media} 
              onMediaClick={handleMediaClick}
            />

            <MediaDialog
              isOpen={isMediaDialogOpen}
              onOpenChange={setIsMediaDialogOpen}
              media={media}
              selectedIndex={selectedMediaIndex}
              onSelectIndex={setSelectedMediaIndex}
            />
          </div>
        )}

        {reportedUserInfo && (
          <div className="mt-4 border-t pt-4">
            <p className="text-sm font-semibold">Signalé : {reportedUserInfo.user.name}</p>
            {reportedUserInfo.platformUrl && (
              <a 
                href={reportedUserInfo.platformUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-xs text-blue-500 hover:underline"
              >
                Profil Instagram
              </a>
            )}
          </div>
        )}
      </CardContent>

      {space && (
        <CardFooter className="flex justify-end border-t pt-4">
          <Link to={space.url} className="text-sm text-blue-500 hover:underline">
            {space.name}
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}
