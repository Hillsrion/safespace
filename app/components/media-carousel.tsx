import { useState } from "react";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "~/components/ui/carousel";
import { Button } from "~/components/ui/button";
import { type EvidenceMedia } from "~/lib/types";
import { evidenceCategoryLabel } from "~/lib/evidence";

interface MediaCarouselProps {
  media: EvidenceMedia[];
  onMediaClick: (index: number) => void;
  className?: string;
  itemClassName?: string;
}

export function MediaCarousel({
  media,
  onMediaClick,
  className = "",
  itemClassName = "md:basis-1/2 lg:basis-1/3"
}: MediaCarouselProps) {
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  if (!media || media.length === 0) return null;

  const revealOrOpen = (item: EvidenceMedia, index: number) => {
    if (!revealedIds.has(item.id)) {
      setRevealedIds((current) => new Set(current).add(item.id));
      return;
    }
    onMediaClick(index);
  };

  return (
    <div className={className}>
      <Carousel
        opts={{
          align: "start",
          loop: media.length > 1,
        }}
        className="w-full"
      >
        <CarouselContent>
          {media.map((mediaItem, index) => (
            <CarouselItem 
              key={mediaItem.id} 
              className={itemClassName}
            >
              <div className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                {mediaItem.type === "image" ? (
                  <img 
                    src={mediaItem.url} 
                    alt={mediaItem.altText || `Evidence ${index + 1}`} 
                    className={`h-full w-full cursor-pointer rounded-lg object-cover transition-all ${
                      revealedIds.has(mediaItem.id) ? "hover:opacity-90" : "scale-110 blur-2xl"
                    }`}
                    onClick={() => revealOrOpen(mediaItem, index)}
                  />
                ) : mediaItem.type === "audio" && revealedIds.has(mediaItem.id) ? (
                  <div className="flex h-full items-center p-4">
                    <audio src={mediaItem.url} controls className="w-full" />
                  </div>
                ) : mediaItem.type === "video" && revealedIds.has(mediaItem.id) ? (
                  <video
                    src={mediaItem.url}
                    controls
                    preload="metadata"
                    className="h-full w-full object-contain bg-black"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-black text-white">
                    <p>{mediaItem.type === "audio" ? "Preuve audio" : "Preuve vidéo"}</p>
                  </div>
                )}
                {!revealedIds.has(mediaItem.id) ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 p-4">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => revealOrOpen(mediaItem, index)}
                      aria-label={`Afficher ${mediaItem.altText || `la preuve ${index + 1}`}`}
                    >
                      Afficher la preuve sensible
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="mt-2 text-sm"><p className="text-muted-foreground">{evidenceCategoryLabel(mediaItem.evidenceCategory)}</p>{mediaItem.caption && <p className="whitespace-pre-wrap break-words">{mediaItem.caption}</p>}</div>
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
    </div>
  );
}
