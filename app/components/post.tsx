import * as React from "react";
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
  const [isImageDialogOpen, setIsImageDialogOpen] = React.useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = React.useState(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Handle post actions (delete, hide, unhide)
  const handlePostAction = async (action: 'delete' | 'hide' | 'unhide') => {
    try {
      setIsSubmitting(true);
      const endpoint = action === 'delete' 
        ? `/api/posts/${id}/delete` 
        : `/api/posts/${id}/status`;
      
      const formData = new FormData();
      if (action !== 'delete') {
        formData.append('_action', action);
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      const result = await response.json() as { success: boolean; action?: string; error?: string };
      
      if (!result || !result.success) {
        throw new Error(result?.error || 'Action failed');
      }
      
      // Call the appropriate callback if provided
      if (action === 'delete' && onDeletePost) {
        onDeletePost(id);
      } else if (action === 'hide' && onHidePost) {
        onHidePost(id);
      } else if (action === 'unhide' && onUnhidePost) {
        onUnhidePost(id);
      }
      
      toast.success(`Post ${action}ed successfully`);
    } catch (error: unknown) {
      console.error(`Error ${action}ing post:`, error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      toast.error(`Failed to ${action} post: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
    setIsImageDialogOpen(true);
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
            <Carousel
              opts={{
                align: "start",
                loop: media.length > 1,
              }}
              className="w-full"
            >
              <CarouselContent>
                {media.map((mediaItem, index) => (
                  <CarouselItem key={mediaItem.id} className="md:basis-1/2 lg:basis-1/3" onClick={() => handleImageClick(index)}>
                    <div className="aspect-square overflow-hidden rounded-md border">
                      {mediaItem.type === "image" ? (
                        <img src={mediaItem.url} alt={mediaItem.altText || `Evidence ${index + 1}`} className="h-full w-full object-cover cursor-pointer" />
                      ) : (
                        // Basic video placeholder - can be improved with a video player component
                        <div className="h-full w-full flex items-center justify-center bg-black text-white">
                          <p>Video: {mediaItem.altText || `Evidence ${index + 1}`}</p>
                          {/* You might want to use mediaItem.thumbnailUrl here */}
                        </div>
                      )}
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {media.length > 1 && (
                <>
                  <CarouselPrevious className="absolute left-2 top-1/2 -translate-y-1/2" />
                  <CarouselNext className="absolute right-2 top-1/2 -translate-y-1/2" />
                </>
              )}
            </Carousel>

            <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
              <DialogContent className="max-w-3xl p-0">
                <DialogHeader className="sr-only">
                  <DialogTitle>Visionneuse d&apos;images</DialogTitle>
                  <DialogDescription>Full size media view with navigation.</DialogDescription>
                </DialogHeader>
                {media[selectedImageIndex] && (
                  <div className="relative">
                     {media[selectedImageIndex].type === 'image' ? (
                       <img 
                          src={media[selectedImageIndex].url} 
                          alt={media[selectedImageIndex].altText || `Evidence ${selectedImageIndex + 1}`} 
                          className="max-h-[80vh] w-full object-contain" 
                      />
                     ) : (
                        <div className="h-[80vh] w-full flex items-center justify-center bg-black">
                            <video 
                                src={media[selectedImageIndex].url} 
                                controls 
                                className="max-h-full max-w-full"
                                autoPlay
                            />
                        </div>
                     )}
                    {media.length > 1 && (
                        <>
                            <Button 
                                variant="ghost" 
                                size="sm"
                                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white px-2 py-1 text-xs"
                                onClick={() => setSelectedImageIndex((prev) => (prev - 1 + media.length) % media.length)}
                            >
                                Précédent
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white px-2 py-1 text-xs"
                                onClick={() => setSelectedImageIndex((prev) => (prev + 1) % media.length)}
                            >
                                Suivant
                            </Button>
                        </>
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>
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
