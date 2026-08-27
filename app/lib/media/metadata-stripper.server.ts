import { validateMediaBytes, type SupportedMediaMimeType } from "./media-policy.server";
import { canonicalizeMedia } from "./media-decoder.server";
import { inspectMediaStructure } from "./media-structure.server";

export { MediaProcessingError } from "./media-processing-error.server";

export type MetadataStripResult = {
  bytes: Uint8Array;
  /** Container validation, real decoding, canonical encoding and output verification succeeded. */
  metadataStripped: true;
  /** Known explicit input metadata was observed and discarded; not a steganography detector. */
  metadataRemoved: boolean;
  removedMetadataKinds: string[];
};

/**
 * Fail closed. No caller may store the input on decoding failure or unavailability.
 * The returned representation retains the input MIME, not its original encoding.
 * This removes embedded metadata, not identities visible/audible in the evidence.
 */
export async function stripMediaMetadata(bytes: Uint8Array, mimeType: SupportedMediaMimeType): Promise<MetadataStripResult> {
  validateMediaBytes({ bytes, declaredMimeType: mimeType });
  const source = inspectMediaStructure(bytes, mimeType);
  const canonical = await canonicalizeMedia(bytes, mimeType, source);
  validateMediaBytes({ bytes: canonical.bytes, declaredMimeType: mimeType });
  return {
    bytes: canonical.bytes,
    metadataStripped: true,
    metadataRemoved: source.removedMetadataKinds.length > 0,
    removedMetadataKinds: source.removedMetadataKinds,
  };
}
