import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "~/components/ui/carousel";
import { type EvidenceMedia } from "~/lib/types";

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
  if (!media || media.length === 0) return null;

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
              <div className="aspect-square overflow-hidden rounded-md border">
                {mediaItem.type === "image" ? (
                  <img 
                    src={mediaItem.url} 
                    alt={mediaItem.altText || `Evidence ${index + 1}`} 
                    className="h-full w-full object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => onMediaClick(index)}
                  />
                ) : (
                  <div 
                    className="h-full w-full flex items-center justify-center bg-black text-white cursor-pointer"
                    onClick={() => onMediaClick(index)}
                  >
                    <p>Video: {mediaItem.altText || `Evidence ${index + 1}`}</p>
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
    </div>
  );
}
