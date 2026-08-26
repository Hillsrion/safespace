import { randomBytes } from "node:crypto";

export const MEDIA_MAX_FILES_PER_POST = 10;
export const MEDIA_MAX_TOTAL_BYTES_PER_POST = 250 * 1024 * 1024;
export const MEDIA_MULTIPART_OVERHEAD_BYTES = 512 * 1024;

export type MediaKind = "image" | "audio" | "video";

export type SupportedMediaMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "audio/mpeg"
  | "audio/wav"
  | "video/mp4"
  | "video/quicktime";

type MediaPolicy = {
  kind: MediaKind;
  extension: string;
  maxBytes: number;
};

export const MEDIA_POLICY: Record<SupportedMediaMimeType, MediaPolicy> = {
  "image/jpeg": { kind: "image", extension: ".jpg", maxBytes: 15 * 1024 * 1024 },
  "image/png": { kind: "image", extension: ".png", maxBytes: 15 * 1024 * 1024 },
  "image/webp": { kind: "image", extension: ".webp", maxBytes: 15 * 1024 * 1024 },
  "image/gif": { kind: "image", extension: ".gif", maxBytes: 15 * 1024 * 1024 },
  "audio/mpeg": { kind: "audio", extension: ".mp3", maxBytes: 30 * 1024 * 1024 },
  "audio/wav": { kind: "audio", extension: ".wav", maxBytes: 30 * 1024 * 1024 },
  "video/mp4": { kind: "video", extension: ".mp4", maxBytes: 100 * 1024 * 1024 },
  "video/quicktime": {
    kind: "video",
    extension: ".mov",
    maxBytes: 100 * 1024 * 1024,
  },
};

const MIME_ALIASES: Readonly<Record<string, SupportedMediaMimeType>> = {
  "image/jpg": "image/jpeg",
  "audio/mp3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
};

export const MEDIA_MAX_REQUEST_BYTES =
  Math.max(...Object.values(MEDIA_POLICY).map(({ maxBytes }) => maxBytes)) +
  MEDIA_MULTIPART_OVERHEAD_BYTES;

export class MediaValidationError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | "empty_file"
      | "unsupported_type"
      | "mime_mismatch"
      | "file_too_large"
      | "malformed_file"
      | "invalid_filename"
  ) {
    super(message);
    this.name = "MediaValidationError";
  }
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function hasPrefix(bytes: Uint8Array, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function looksLikeMp3Frame(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || (bytes[1] & 0xe0) !== 0xe0) {
    return false;
  }
  const version = (bytes[1] >> 3) & 0x03;
  const layer = (bytes[1] >> 1) & 0x03;
  const bitrate = (bytes[2] >> 4) & 0x0f;
  const sampleRate = (bytes[2] >> 2) & 0x03;
  return version !== 1 && layer !== 0 && bitrate !== 0 && bitrate !== 15 && sampleRate !== 3;
}

/** Detects the actual format from the file signature, never from its name. */
export function sniffMediaMimeType(bytes: Uint8Array): SupportedMediaMimeType | null {
  if (bytes.length < 12) return null;
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return "image/gif";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") {
    return "audio/wav";
  }
  if (ascii(bytes, 0, 3) === "ID3" || looksLikeMp3Frame(bytes)) {
    return "audio/mpeg";
  }
  if (ascii(bytes, 4, 8) === "ftyp") {
    return ascii(bytes, 8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  }
  return null;
}

export function normalizeDeclaredMimeType(value: string): SupportedMediaMimeType | null {
  const normalized = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (normalized in MEDIA_POLICY) return normalized as SupportedMediaMimeType;
  return MIME_ALIASES[normalized] ?? null;
}

export function validateMediaBytes(input: {
  bytes: Uint8Array;
  declaredMimeType: string;
}): { mimeType: SupportedMediaMimeType; policy: MediaPolicy } {
  if (input.bytes.byteLength === 0) {
    throw new MediaValidationError("The uploaded file is empty", "empty_file");
  }

  const declaredMimeType = normalizeDeclaredMimeType(input.declaredMimeType);
  if (!declaredMimeType) {
    throw new MediaValidationError("This media type is not supported", "unsupported_type");
  }

  const detectedMimeType = sniffMediaMimeType(input.bytes);
  if (!detectedMimeType) {
    throw new MediaValidationError(
      "The file signature is missing or unsupported",
      "malformed_file"
    );
  }
  if (detectedMimeType !== declaredMimeType) {
    throw new MediaValidationError(
      `The declared type ${declaredMimeType} does not match the file signature`,
      "mime_mismatch"
    );
  }

  const policy = MEDIA_POLICY[detectedMimeType];
  if (input.bytes.byteLength > policy.maxBytes) {
    throw new MediaValidationError(
      `${policy.kind} files are limited to ${Math.floor(policy.maxBytes / 1024 / 1024)} MiB`,
      "file_too_large"
    );
  }

  return { mimeType: detectedMimeType, policy };
}

export function sanitizeOriginalFileName(
  value: string,
  mimeType: SupportedMediaMimeType
): string {
  const leaf = value.normalize("NFKC").split(/[\\/]/).at(-1)?.trim() ?? "";
  const withoutControlCharacters = leaf.replace(/[\u0000-\u001f\u007f]/g, "");
  const base = withoutControlCharacters
    .replace(/^\.+/, "")
    .replace(/[^\p{L}\p{N}._() -]/gu, "_")
    .slice(0, 160)
    .trim();
  if (!base) {
    throw new MediaValidationError("The media filename is invalid", "invalid_filename");
  }

  const canonicalExtension = MEDIA_POLICY[mimeType].extension;
  const withoutExtension = base.replace(/\.[^.]{1,10}$/, "").replace(/\.+$/, "");
  return `${withoutExtension || "evidence"}${canonicalExtension}`;
}

/**
 * Keys deliberately contain no user, post, filename, timestamp, or sequential
 * identifier. A 256-bit random component makes enumeration impractical.
 */
export function createPrivateStorageKey(mimeType: SupportedMediaMimeType): string {
  return `evidence/v1/${randomBytes(32).toString("base64url")}${MEDIA_POLICY[mimeType].extension}`;
}
