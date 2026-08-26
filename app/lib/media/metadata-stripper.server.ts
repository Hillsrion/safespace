import type { SupportedMediaMimeType } from "./media-policy.server";

export type MetadataStripResult = {
  bytes: Uint8Array;
  /** True only when a format-aware sanitizer completed successfully. */
  metadataStripped: true;
  /** Distinguishes a clean file from one where metadata was actually removed. */
  metadataRemoved: boolean;
  removedMetadataKinds: string[];
};

export class MediaProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaProcessingError";
  }
}
function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setUint32(0, value, true);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function result(bytes: Uint8Array, removed: string[]): MetadataStripResult {
  const removedMetadataKinds = unique(removed);
  return {
    bytes,
    metadataStripped: true,
    metadataRemoved: removedMetadataKinds.length > 0,
    removedMetadataKinds,
  };
}

function stripJpeg(input: Uint8Array): MetadataStripResult {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new MediaProcessingError("Malformed JPEG header");
  }

  const parts: Uint8Array[] = [input.subarray(0, 2)];
  const removed: string[] = [];
  let offset = 2;
  while (offset < input.length) {
    const segmentStart = offset;
    if (input[offset] !== 0xff) {
      throw new MediaProcessingError("Malformed JPEG segment marker");
    }
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    if (offset >= input.length) throw new MediaProcessingError("Truncated JPEG marker");
    const marker = input[offset];
    offset += 1;

    if (marker === 0xd9) {
      parts.push(input.subarray(segmentStart));
      return result(concat(parts), removed);
    }
    if (marker === 0xda) {
      if (offset + 2 > input.length) throw new MediaProcessingError("Truncated JPEG scan");
      const scanHeaderLength = (input[offset] << 8) | input[offset + 1];
      if (scanHeaderLength < 2 || offset + scanHeaderLength > input.length) {
        throw new MediaProcessingError("Invalid JPEG scan length");
      }
      parts.push(input.subarray(segmentStart));
      return result(concat(parts), removed);
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(segmentStart, offset));
      continue;
    }
    if (offset + 2 > input.length) throw new MediaProcessingError("Truncated JPEG segment");
    const segmentLength = (input[offset] << 8) | input[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > input.length) {
      throw new MediaProcessingError("Invalid JPEG segment length");
    }
    const segmentEnd = offset + segmentLength;
    const shouldRemove =
      marker === 0xe1 ||
      marker === 0xe2 ||
      marker === 0xec ||
      marker === 0xed ||
      marker === 0xef ||
      marker === 0xfe;
    if (shouldRemove) {
      if (marker === 0xe1) removed.push("EXIF/XMP");
      else if (marker === 0xe2) removed.push("ICC profile");
      else if (marker === 0xed) removed.push("IPTC/Photoshop");
      else if (marker === 0xfe) removed.push("JPEG comment");
      else removed.push("JPEG application metadata");
    } else {
      parts.push(input.subarray(segmentStart, segmentEnd));
    }
    offset = segmentEnd;
  }
  throw new MediaProcessingError("JPEG has no image scan or end marker");
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function stripPng(input: Uint8Array): MetadataStripResult {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, index) => input[index] === byte)) {
    throw new MediaProcessingError("Malformed PNG header");
  }
  const removable = new Map([
    ["eXIf", "EXIF"],
    ["tEXt", "PNG text"],
    ["zTXt", "PNG compressed text"],
    ["iTXt", "PNG international text/XMP"],
    ["tIME", "PNG timestamp"],
  ]);
  const parts = [input.subarray(0, 8)];
  const removed: string[] = [];
  let offset = 8;
  let sawHeader = false;
  let sawEnd = false;
  while (offset < input.length) {
    if (offset + 12 > input.length) throw new MediaProcessingError("Truncated PNG chunk");
    const length = readUint32BE(input, offset);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > input.length) throw new MediaProcessingError("Invalid PNG chunk length");
    const type = ascii(input, offset + 4, offset + 8);
    const expectedCrc = readUint32BE(input, offset + 8 + length);
    const actualCrc = crc32(input.subarray(offset + 4, offset + 8 + length));
    if (actualCrc !== expectedCrc) throw new MediaProcessingError("PNG CRC validation failed");
    if (!sawHeader && type !== "IHDR") throw new MediaProcessingError("PNG IHDR must be first");
    sawHeader ||= type === "IHDR";

    const removedKind = removable.get(type);
    if (removedKind) removed.push(removedKind);
    else parts.push(input.subarray(offset, chunkEnd));
    offset = chunkEnd;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawHeader || !sawEnd || offset !== input.length) {
    throw new MediaProcessingError("PNG structure is incomplete or has trailing data");
  }
  return result(concat(parts), removed);
}

function readGifSubBlocksEnd(input: Uint8Array, start: number): number {
  let offset = start;
  while (offset < input.length) {
    const length = input[offset];
    offset += 1;
    if (length === 0) return offset;
    if (offset + length > input.length) throw new MediaProcessingError("Truncated GIF data block");
    offset += length;
  }
  throw new MediaProcessingError("Unterminated GIF data blocks");
}

function stripGif(input: Uint8Array): MetadataStripResult {
  if (input.length < 13) throw new MediaProcessingError("Truncated GIF header");
  const globalTableSize =
    (input[10] & 0x80) !== 0 ? 3 * 2 ** ((input[10] & 0x07) + 1) : 0;
  let offset = 13 + globalTableSize;
  if (offset > input.length) throw new MediaProcessingError("Truncated GIF color table");
  const parts = [input.subarray(0, offset)];
  const removed: string[] = [];

  while (offset < input.length) {
    const blockStart = offset;
    const introducer = input[offset++];
    if (introducer === 0x3b) {
      parts.push(input.subarray(blockStart, offset));
      if (offset !== input.length) throw new MediaProcessingError("GIF has trailing data");
      return result(concat(parts), removed);
    }
    if (introducer === 0x2c) {
      if (offset + 9 > input.length) throw new MediaProcessingError("Truncated GIF image descriptor");
      const localFlags = input[offset + 8];
      offset += 9;
      if ((localFlags & 0x80) !== 0) offset += 3 * 2 ** ((localFlags & 0x07) + 1);
      if (offset >= input.length) throw new MediaProcessingError("Truncated GIF image data");
      offset += 1; // LZW minimum code size
      offset = readGifSubBlocksEnd(input, offset);
      parts.push(input.subarray(blockStart, offset));
      continue;
    }
    if (introducer !== 0x21 || offset >= input.length) {
      throw new MediaProcessingError("Unknown GIF block");
    }

    const label = input[offset++];
    if (label === 0xf9) {
      if (offset + 6 > input.length || input[offset] !== 4 || input[offset + 5] !== 0) {
        throw new MediaProcessingError("Malformed GIF graphics control block");
      }
      offset += 6;
      parts.push(input.subarray(blockStart, offset));
      continue;
    }
    if (label === 0x01 || label === 0xff) {
      if (offset >= input.length) throw new MediaProcessingError("Truncated GIF extension");
      const headerLength = input[offset];
      const headerStart = offset + 1;
      const headerEnd = headerStart + headerLength;
      if (headerEnd > input.length) throw new MediaProcessingError("Truncated GIF extension header");
      offset = readGifSubBlocksEnd(input, headerEnd);
      const identifier = ascii(input, headerStart, headerEnd);
      if (label === 0xff && /XMP|ADOBE/i.test(identifier)) {
        removed.push("GIF XMP/application metadata");
      } else {
        parts.push(input.subarray(blockStart, offset));
      }
      continue;
    }
    offset = readGifSubBlocksEnd(input, offset);
    if (label === 0xfe) removed.push("GIF comment");
    else parts.push(input.subarray(blockStart, offset));
  }
  throw new MediaProcessingError("GIF has no trailer");
}

function stripWebp(input: Uint8Array): MetadataStripResult {
  if (input.length < 12 || ascii(input, 0, 4) !== "RIFF" || ascii(input, 8, 12) !== "WEBP") {
    throw new MediaProcessingError("Malformed WebP header");
  }
  if (readUint32LE(input, 4) + 8 !== input.length) {
    throw new MediaProcessingError("Invalid WebP RIFF length");
  }

  const chunks: Array<{ type: string; bytes: Uint8Array }> = [];
  const removed: string[] = [];
  let offset = 12;
  while (offset < input.length) {
    if (offset + 8 > input.length) throw new MediaProcessingError("Truncated WebP chunk");
    const type = ascii(input, offset, offset + 4);
    const size = readUint32LE(input, offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (end > input.length) throw new MediaProcessingError("Invalid WebP chunk length");
    if (type === "EXIF" || type === "XMP ") removed.push(type === "EXIF" ? "EXIF" : "XMP");
    else chunks.push({ type, bytes: input.slice(offset, end) });
    offset = end;
  }

  for (const chunk of chunks) {
    if (chunk.type === "VP8X" && chunk.bytes.length >= 9) {
      // Clear the EXIF and XMP feature bits when those chunks were removed.
      chunk.bytes[8] &= ~(0x08 | 0x04);
    }
  }
  const output = concat([input.subarray(0, 12), ...chunks.map(({ bytes }) => bytes)]);
  writeUint32LE(output, 4, output.length - 8);
  return result(output, removed);
}

function isMp3FrameHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || (bytes[1] & 0xe0) !== 0xe0) return false;
  const version = (bytes[1] >> 3) & 0x03;
  const layer = (bytes[1] >> 1) & 0x03;
  const bitrate = (bytes[2] >> 4) & 0x0f;
  const sampleRate = (bytes[2] >> 2) & 0x03;
  return version !== 1 && layer !== 0 && bitrate !== 0 && bitrate !== 15 && sampleRate !== 3;
}

function stripMp3(input: Uint8Array): MetadataStripResult {
  let start = 0;
  let end = input.length;
  const removed: string[] = [];
  while (end - start >= 10 && ascii(input, start, start + 3) === "ID3") {
    const sizeBytes = input.subarray(start + 6, start + 10);
    if ([...sizeBytes].some((byte) => byte >= 0x80)) {
      throw new MediaProcessingError("Invalid ID3 size");
    }
    const tagSize =
      (sizeBytes[0] << 21) | (sizeBytes[1] << 14) | (sizeBytes[2] << 7) | sizeBytes[3];
    const footerSize = (input[start + 5] & 0x10) !== 0 ? 10 : 0;
    const next = start + 10 + tagSize + footerSize;
    if (next > end) throw new MediaProcessingError("Truncated ID3 tag");
    start = next;
    removed.push("ID3v2");
  }
  if (end - start >= 128 && ascii(input, end - 128, end - 125) === "TAG") {
    end -= 128;
    removed.push("ID3v1");
  }
  if (end - start >= 32 && ascii(input, end - 32, end - 24) === "APETAGEX") {
    const tagSize = readUint32LE(input, end - 20);
    if (tagSize < 32 || tagSize > end - start) throw new MediaProcessingError("Invalid APE tag");
    end -= tagSize;
    removed.push("APE tag");
  }
  const audio = input.slice(start, end);
  if (!isMp3FrameHeader(audio)) {
    throw new MediaProcessingError("MP3 contains no valid audio frame after metadata");
  }
  return result(audio, removed);
}

function stripWav(input: Uint8Array): MetadataStripResult {
  if (input.length < 12 || ascii(input, 0, 4) !== "RIFF" || ascii(input, 8, 12) !== "WAVE") {
    throw new MediaProcessingError("Malformed WAV header");
  }
  if (readUint32LE(input, 4) + 8 !== input.length) {
    throw new MediaProcessingError("Invalid WAV RIFF length");
  }
  const removable = new Map([
    ["LIST", "WAV INFO metadata"],
    ["ID3 ", "ID3"],
    ["id3 ", "ID3"],
    ["bext", "Broadcast WAV metadata"],
    ["iXML", "WAV XML metadata"],
    ["XMP ", "XMP"],
  ]);
  const chunks: Uint8Array[] = [];
  const removed: string[] = [];
  let offset = 12;
  let hasFormat = false;
  let hasAudio = false;
  while (offset < input.length) {
    if (offset + 8 > input.length) throw new MediaProcessingError("Truncated WAV chunk");
    const type = ascii(input, offset, offset + 4);
    const size = readUint32LE(input, offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (end > input.length) throw new MediaProcessingError("Invalid WAV chunk length");
    hasFormat ||= type === "fmt ";
    hasAudio ||= type === "data";
    const removedKind = removable.get(type);
    if (removedKind) removed.push(removedKind);
    else chunks.push(input.subarray(offset, end));
    offset = end;
  }
  if (!hasFormat || !hasAudio) throw new MediaProcessingError("WAV lacks format or audio data");
  const output = concat([input.subarray(0, 12), ...chunks]);
  writeUint32LE(output, 4, output.length - 8);
  return result(output, removed);
}

type Mp4Box = {
  type: string;
  start: number;
  end: number;
  typeOffset: number;
  payloadStart: number;
};

function readMp4Boxes(input: Uint8Array, start: number, end: number): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) throw new MediaProcessingError("Truncated MP4 box");
    const size32 = readUint32BE(input, offset);
    const typeOffset = offset + 4;
    const type = ascii(input, typeOffset, typeOffset + 4);
    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > end) throw new MediaProcessingError("Truncated extended MP4 box");
      const large = new DataView(input.buffer, input.byteOffset + offset + 8, 8).getBigUint64(0, false);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new MediaProcessingError("MP4 box is too large");
      size = Number(large);
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) {
      throw new MediaProcessingError("Invalid MP4 box length");
    }
    boxes.push({ type, start: offset, end: offset + size, typeOffset, payloadStart: offset + headerSize });
    offset += size;
  }
  return boxes;
}

const MP4_CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "dinf", "edts", "moof", "traf"]);
const ADOBE_XMP_UUID = "be7acfcb97a942e89c71999491e3afac";

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stripMp4(input: Uint8Array): MetadataStripResult {
  const output = input.slice();
  const removed: string[] = [];
  const root = readMp4Boxes(output, 0, output.length);
  if (!root.some(({ type }) => type === "ftyp") || !root.some(({ type }) => type === "mdat")) {
    throw new MediaProcessingError("MP4 lacks required ftyp or media data boxes");
  }

  const visit = (boxes: Mp4Box[]): void => {
    for (const box of boxes) {
      const xmpUuid =
        box.type === "uuid" &&
        box.payloadStart + 16 <= box.end &&
        hex(output.subarray(box.payloadStart, box.payloadStart + 16)) === ADOBE_XMP_UUID;
      if (box.type === "udta" || box.type === "meta" || box.type === "XMP_" || xmpUuid) {
        output.set([0x66, 0x72, 0x65, 0x65], box.typeOffset); // `free`
        output.fill(0, box.payloadStart, box.end);
        removed.push(xmpUuid || box.type === "XMP_" ? "XMP" : "MP4/QuickTime metadata");
        continue;
      }
      if (MP4_CONTAINERS.has(box.type)) {
        visit(readMp4Boxes(output, box.payloadStart, box.end));
      }
    }
  };
  visit(root);
  return result(output, removed);
}

/**
 * Every accepted format has a structural parser. Malformed files are rejected
 * rather than being passed through with a misleading `metadataStripped` flag.
 */
export function stripMediaMetadata(
  bytes: Uint8Array,
  mimeType: SupportedMediaMimeType
): MetadataStripResult {
  switch (mimeType) {
    case "image/jpeg":
      return stripJpeg(bytes);
    case "image/png":
      return stripPng(bytes);
    case "image/gif":
      return stripGif(bytes);
    case "image/webp":
      return stripWebp(bytes);
    case "audio/mpeg":
      return stripMp3(bytes);
    case "audio/wav":
      return stripWav(bytes);
    case "video/mp4":
    case "video/quicktime":
      return stripMp4(bytes);
  }
}
