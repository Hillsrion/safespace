import { useState } from "react";
import { Link } from "react-router";
import { usePostActions } from "~/components/post/hooks/usePostActions";
import { MediaDialog } from "~/components/media-dialog";
import { MediaCarousel } from "~/components/media-carousel";
import { PostActionsMenu } from "./post-actions-menu";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "~/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge, type BadgeVariant } from "~/components/ui/badge";
import { CircleAlert, ShieldUser } from "lucide-react";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Button } from "~/components/ui/button";
import { 
  type PostComponentProps, 
} from "~/lib/types";
import { getProfileUrl } from "./utils";

export function Post({
  id,
  author,
  createdAt,
  content,
  media,
  status,
  reportedEntity,
  space,
  currentUser,
}: PostComponentProps) {
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  
  // The hook now uses Zustand for state management, so callbacks are not needed here.
  const { handlePostAction, isSubmitting } = usePostActions({
    postId: id,
  });

  const handleMediaClick = (index: number) => {
    setSelectedMediaIndex(index);
    setIsMediaDialogOpen(true);
  };

  const isCurrentUserAuthor = author.id === currentUser.id;

  const getStatusBadge = () => {
    if (!status || status === "published") return null;

    const statusMap: Record<string, { variant: BadgeVariant; text: string }> = {
      hidden: { variant: "destructive", text: "Caché" },
      admin_only: { variant: "secondary", text: "Admin Seulement" },
      pending_review: { variant: "outline", text: "En Attente" },
    };

    const statusConfig = statusMap[status];
    if (!statusConfig) return null;

    return (
      <Badge variant={statusConfig.variant} className="mr-2">
        {statusConfig.text}
      </Badge>
    );
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
          <PostActionsMenu
            status={status}
            isSubmitting={isSubmitting}
            isCurrentUserAuthor={isCurrentUserAuthor}
            currentUser={currentUser}
            onDeletePost={() => handlePostAction('delete')}
            onHidePost={() => handlePostAction('hide')}
            onUnhidePost={() => handlePostAction('unhide')}
          />
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

      </CardContent>

      {space && (
        <CardFooter className="flex justify-between border-t py-4">
          {reportedEntity && (
            <div className="flex">
              <div className="flex flex-col">
                <Link to={`/dashboard/entities/${reportedEntity.id}`} className="text-sm font-semibold text-muted-foreground mr-1 transition-colors hover:text-muted-foreground/80 duration-200 ease-in-out">
                  {reportedEntity.name}
                </Link>
                {reportedEntity.handles && reportedEntity.handles.length > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                      <a 
                        href={getProfileUrl(reportedEntity.handles[0].handle, reportedEntity.handles[0].platform)} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-xs text-blue-300 transition-colors hover:text-blue-400 duration-200 ease-in-out"
                      >
                        @{reportedEntity.handles[0].handle}
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{reportedEntity.handles[0].platform}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              </div>
            </div>
          )}
          <Button variant="outline" asChild>
            <Link to={space.url}>
              <ShieldUser className="w-12 h-12" />
              {space.name}
            </Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
