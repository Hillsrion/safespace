import { MediaProcessingError } from "./media-processing-error.server";

// These are decoder safety limits, in addition to the compressed upload limits.
// Raising them requires a worker/container memory and CPU capacity review.
export const MEDIA_PROCESSING_LIMITS = Object.freeze({
  dimension: 8192,
  imagePixels: 24_000_000,
  videoDimension: 4096,
  videoPixels: 8_847_360,
  animationFrames: 300,
  animationPixels: 240_000_000,
  animationSeconds: 120,
  videoFrames: 18_000,
  videoSeconds: 600,
  audioSeconds: 900,
  frameRate: 60,
  channels: 2,
  sampleRate: 96_000,
  audioPackets: 200_000,
  containerEntries: 200_000,
  pngInflatedBytes: 192 * 1024 * 1024,
  allocationBytes: 256 * 1024 * 1024,
  diagnosticsBytes: 256 * 1024,
});

export function checkDimensions(width: number, height: number, video = false): void {
  const maxDimension = video ? MEDIA_PROCESSING_LIMITS.videoDimension : MEDIA_PROCESSING_LIMITS.dimension;
  const maxPixels = video ? MEDIA_PROCESSING_LIMITS.videoPixels : MEDIA_PROCESSING_LIMITS.imagePixels;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new MediaProcessingError("Media dimensions are invalid");
  }
  if (width > maxDimension || height > maxDimension || width * height > maxPixels) {
    throw new MediaProcessingError("Media dimensions exceed processing limits", "resource_limit");
  }
}
