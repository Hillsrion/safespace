import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { type EvidenceMedia } from "~/lib/types";

interface MediaDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  media: EvidenceMedia[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}

export function MediaDialog({
  isOpen,
  onOpenChange,
  media,
  selectedIndex,
  onSelectIndex,
}: MediaDialogProps) {
  if (!media[selectedIndex]) return null;

  const currentMedia = media[selectedIndex];
  const hasMultipleMedia = media.length > 1;

  const navigateMedia = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' 
      ? (selectedIndex - 1 + media.length) % media.length
      : (selectedIndex + 1) % media.length;
    onSelectIndex(newIndex);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Visionneuse d&apos;images</DialogTitle>
          <DialogDescription>Full size media view with navigation.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          {currentMedia.type === 'image' ? (
            <img 
              src={currentMedia.url} 
              alt={currentMedia.altText || `Evidence ${selectedIndex + 1}`} 
              className="max-h-[80vh] w-full object-contain" 
              loading="lazy"
            />
          ) : (
            <div className="h-[80vh] w-full flex items-center justify-center bg-black">
              <video 
                src={currentMedia.url} 
                controls 
                className="max-h-full max-w-full"
                autoPlay
              />
            </div>
          )}
          
          {hasMultipleMedia && (
            <>
              <Button 
                variant="ghost" 
                size="sm"
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white px-2 py-1 text-xs"
                onClick={() => navigateMedia('prev')}
                aria-label="Previous media"
              >
                Précédent
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 text-white px-2 py-1 text-xs"
                onClick={() => navigateMedia('next')}
                aria-label="Next media"
              >
                Suivant
              </Button>
              <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                <div className="bg-black/50 text-white text-sm px-3 py-1 rounded-full">
                  {selectedIndex + 1} / {media.length}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
