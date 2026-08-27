/** Messages must never include a filename, decoder output, tag value, or path. */
export class MediaProcessingError extends Error {
  constructor(
    message: string,
    public readonly reason: "invalid_media" | "resource_limit" | "processor_unavailable" = "invalid_media"
  ) {
    super(message);
    this.name = "MediaProcessingError";
  }
}
