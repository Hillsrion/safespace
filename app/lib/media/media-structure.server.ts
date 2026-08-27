import { inflateSync } from "node:zlib";
import type { SupportedMediaMimeType } from "./media-policy.server";
import { MediaProcessingError } from "./media-processing-error.server";
import { checkDimensions, MEDIA_PROCESSING_LIMITS as LIMITS } from "./media-processing-policy.server";

/** Structural checks are necessary, but are NOT a substitute for codec decoding. */
export type StructuredMedia = {
  bytes: Uint8Array;
  removedMetadataKinds: string[];
  width?: number;
  height?: number;
  frames?: number;
  durationSeconds?: number;
  animationLoop?: number;
};

function requireMedia(condition: unknown, message = "Media structure is invalid"): asserts condition {
  if (!condition) throw new MediaProcessingError(message);
}
function ascii(bytes: Uint8Array, start: number, end: number): string {
  return Buffer.from(bytes.subarray(start, end)).toString("latin1");
}
function u16(bytes: Uint8Array, offset: number, little = false): number {
  requireMedia(offset >= 0 && offset + 2 <= bytes.length);
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, little);
}
function u32(bytes: Uint8Array, offset: number, little = false): number {
  requireMedia(offset >= 0 && offset + 4 <= bytes.length);
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, little);
}
function put32(bytes: Uint8Array, offset: number, value: number, little = false): void {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setUint32(0, value, little);
}
function join(parts: Uint8Array[]): Uint8Array {
  return new Uint8Array(Buffer.concat(parts));
}
function structured(bytes: Uint8Array, removed: string[], details: Omit<StructuredMedia, "bytes" | "removedMetadataKinds"> = {}): StructuredMedia {
  return { bytes, removedMetadataKinds: [...new Set(removed)], ...details };
}
function boundEntries(count: number): void {
  requireMedia(Number.isInteger(count) && count >= 0 && count <= LIMITS.containerEntries, "Too many media container entries");
}

function jpeg(input: Uint8Array): StructuredMedia {
  requireMedia(input[0] === 0xff && input[1] === 0xd8, "Invalid JPEG signature");
  const parts: Uint8Array[] = [input.subarray(0, 2)];
  const removed: string[] = [];
  const components = new Set<number>();
  let width = 0, height = 0, scans = 0, offset = 2, markers = 0;
  let quantization = false, huffman = false, progressive = false;
  while (offset < input.length) {
    boundEntries(++markers);
    const start = offset;
    requireMedia(input[offset++] === 0xff, "Invalid JPEG marker");
    while (input[offset] === 0xff) offset++;
    requireMedia(offset < input.length, "Truncated JPEG marker");
    const marker = input[offset++];
    if (marker === 0xd9) {
      requireMedia(width && height && scans && offset === input.length, "Incomplete JPEG or trailing payload");
      parts.push(input.subarray(start, offset));
      return structured(join(parts), removed, { width, height, frames: 1 });
    }
    requireMedia(marker !== 0 && marker !== 0xd8 && marker !== 1 && !(marker >= 0xd0 && marker <= 0xd7), "Unexpected JPEG marker");
    const length = u16(input, offset);
    const end = offset + length;
    requireMedia(length >= 2 && end <= input.length, "Truncated JPEG segment");
    const payload = offset + 2;
    if (marker === 0xc0 || marker === 0xc2) {
      requireMedia(!width && length >= 11 && input[payload] === 8, "Unsupported JPEG frame");
      height = u16(input, payload + 1); width = u16(input, payload + 3);
      checkDimensions(width, height);
      const count = input[payload + 5];
      requireMedia([1, 3, 4].includes(count) && length === 8 + 3 * count, "Invalid JPEG components");
      for (let index = 0; index < count; index++) {
        const position = payload + 6 + 3 * index;
        const id = input[position], sampling = input[position + 1];
        requireMedia(!components.has(id) && (sampling >> 4) >= 1 && (sampling >> 4) <= 4 && (sampling & 15) >= 1 && (sampling & 15) <= 4 && input[position + 2] <= 3, "Invalid JPEG component");
        components.add(id);
      }
      progressive = marker === 0xc2;
    } else if (marker === 0xdb) {
      let position = payload;
      while (position < end) {
        const descriptor = input[position++];
        requireMedia((descriptor >> 4) <= 1 && (descriptor & 15) <= 3, "Invalid JPEG quantization table");
        position += (descriptor >> 4) ? 128 : 64;
      }
      requireMedia(position === end && position > payload, "Truncated JPEG quantization table");
      quantization = true;
    } else if (marker === 0xc4) {
      let position = payload;
      while (position < end) {
        const descriptor = input[position++];
        requireMedia((descriptor >> 4) <= 1 && (descriptor & 15) <= 3 && position + 16 <= end, "Invalid JPEG Huffman table");
        let count = 0;
        for (let index = 0; index < 16; index++) count += input[position++];
        requireMedia(count > 0 && count <= 256 && position + count <= end, "Invalid JPEG Huffman symbols");
        position += count;
      }
      requireMedia(position === end && position > payload);
      huffman = true;
    } else if (marker === 0xda) {
      const count = input[payload];
      requireMedia(width && quantization && huffman && count >= 1 && count <= components.size && length === 6 + 2 * count, "JPEG scan lacks a valid frame or tables");
      const selected = new Set<number>();
      for (let index = 0; index < count; index++) {
        const id = input[payload + 1 + 2 * index], table = input[payload + 2 + 2 * index];
        requireMedia(components.has(id) && !selected.has(id) && (table >> 4) <= 3 && (table & 15) <= 3, "Invalid JPEG scan components");
        selected.add(id);
      }
      const spectral = payload + 1 + 2 * count;
      requireMedia(input[spectral] <= input[spectral + 1] && input[spectral + 1] <= 63, "Invalid JPEG spectral selection");
      requireMedia(progressive || (input[spectral] === 0 && input[spectral + 1] === 63 && input[spectral + 2] === 0), "Invalid baseline JPEG scan");
      let position = end;
      let entropyBytes = 0;
      while (position < input.length) {
        if (input[position] !== 0xff) { position++; entropyBytes++; continue; }
        let next = position + 1;
        while (input[next] === 0xff) next++;
        requireMedia(next < input.length, "Truncated JPEG scan marker");
        if (input[next] === 0 || (input[next] >= 0xd0 && input[next] <= 0xd7)) {
          position = next + 1; entropyBytes++; continue;
        }
        break;
      }
      requireMedia(entropyBytes > 0 && position < input.length, "JPEG scan has no complete image data");
      parts.push(input.subarray(start, position));
      scans++; offset = position; continue;
    } else if (marker === 0xdd) {
      requireMedia(length === 4, "Invalid JPEG restart interval");
    } else if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      // APP14's color transform is rendering data; retain only its fixed header.
      if (marker === 0xee && length === 14 && ascii(input, payload, payload + 5) === "Adobe" && input[end - 1] <= 2) {
        parts.push(input.subarray(start, end)); offset = end; continue;
      }
      removed.push(marker === 0xe1 ? "EXIF/XMP" : marker === 0xe2 ? "ICC profile" : marker === 0xed ? "IPTC/Photoshop" : marker === 0xfe ? "JPEG comment" : "JPEG application metadata");
      offset = end; continue;
    } else {
      throw new MediaProcessingError("Unsupported JPEG marker or coding mode");
    }
    parts.push(input.subarray(start, end)); offset = end;
  }
  throw new MediaProcessingError("JPEG end marker is missing");
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function png(input: Uint8Array): StructuredMedia {
  requireMedia(Buffer.from(input.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Invalid PNG signature");
  let offset = 8, width = 0, height = 0, color = -1, depth = 0, interlace = 0, chunks = 0;
  let paletteEntries = 0, idatStarted = false, idatEnded = false, ended = false, transparency = false;
  const compressed: Uint8Array[] = [], parts = [input.subarray(0, 8)], removed: string[] = [];
  while (offset < input.length) {
    boundEntries(++chunks);
    requireMedia(offset + 12 <= input.length, "Truncated PNG chunk");
    const size = u32(input, offset), start = offset + 8, end = start + size;
    requireMedia(end + 4 <= input.length, "Invalid PNG chunk size");
    const type = ascii(input, offset + 4, start);
    requireMedia(/^[A-Za-z]{4}$/.test(type) && /[A-Z]/.test(type[2]), "Invalid PNG chunk name");
    requireMedia(u32(input, end) === crc32(input.subarray(offset + 4, end)), "PNG CRC mismatch");
    requireMedia(chunks !== 1 || type === "IHDR", "PNG IHDR must be first");
    if (idatStarted && type !== "IDAT") idatEnded = true;
    if (type === "IHDR") {
      requireMedia(chunks === 1 && size === 13, "Duplicate or malformed PNG IHDR");
      width = u32(input, start); height = u32(input, start + 4); checkDimensions(width, height);
      depth = input[start + 8]; color = input[start + 9]; interlace = input[start + 12];
      const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      requireMedia(depths[color]?.includes(depth) && input[start + 10] === 0 && input[start + 11] === 0 && interlace <= 1, "Unsupported PNG pixel format");
    } else if (type === "PLTE") {
      requireMedia(!idatStarted && !paletteEntries && color !== 0 && color !== 4 && size >= 3 && size <= 768 && size % 3 === 0, "Invalid PNG palette");
      paletteEntries = size / 3;
      requireMedia(color !== 3 || paletteEntries <= 2 ** depth, "PNG palette exceeds bit depth");
    } else if (type === "IDAT") {
      requireMedia(!idatEnded && (color !== 3 || paletteEntries > 0), "Invalid PNG image data order");
      idatStarted = true; compressed.push(input.subarray(start, end));
    } else if (type === "IEND") {
      requireMedia(size === 0 && idatStarted && end + 4 === input.length, "Invalid PNG end or trailing payload");
      ended = true;
    } else if (type === "tRNS") {
      requireMedia(!transparency && !idatStarted && ((color === 0 && size === 2) || (color === 2 && size === 6) || (color === 3 && size > 0 && size <= paletteEntries)), "Invalid PNG transparency");
      transparency = true;
    } else {
      requireMedia(type !== "acTL" && type !== "fcTL" && type !== "fdAT", "Animated PNG is not supported");
      requireMedia(type[0] === type[0].toLowerCase(), "Unknown critical PNG chunk");
      const kind: Record<string, string> = { eXIf: "EXIF", tEXt: "PNG text", zTXt: "PNG compressed text", iTXt: "PNG international text/XMP", tIME: "PNG timestamp", iCCP: "ICC profile" };
      removed.push(kind[type] ?? "PNG ancillary metadata");
      offset = end + 4; continue;
    }
    parts.push(input.subarray(offset, end + 4)); offset = end + 4;
  }
  requireMedia(ended && width && height, "Incomplete PNG");
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const rows: Array<{ count: number; bytes: number }> = [];
  for (const [x, y, dx, dy] of passes) {
    const w = Math.max(0, Math.ceil((width - x) / dx)), h = Math.max(0, Math.ceil((height - y) / dy));
    if (w && h) rows.push({ count: h, bytes: 1 + Math.ceil(w * channels[color] * depth / 8) });
  }
  const expected = rows.reduce((total, row) => total + row.count * row.bytes, 0);
  requireMedia(expected > 0 && expected <= LIMITS.pngInflatedBytes, "PNG decoded size exceeds limits");
  const data = join(compressed);
  try {
    // @types/node 22 omits the info:true overload, although Node returns both.
    const inflated = inflateSync(data, { maxOutputLength: expected + 1, info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
    requireMedia(inflated.buffer.length === expected && inflated.engine.bytesWritten === data.length, "PNG compressed stream has missing or extra pixels");
    let position = 0;
    for (const row of rows) for (let index = 0; index < row.count; index++) {
      requireMedia(inflated.buffer[position] <= 4, "Invalid PNG row filter"); position += row.bytes;
    }
  } catch (error) {
    if (error instanceof MediaProcessingError) throw error;
    throw new MediaProcessingError("PNG pixel decompression failed");
  }
  return structured(join(parts), removed, { width, height, frames: 1 });
}

function gifBlocks(input: Uint8Array, start: number): { end: number; data: Uint8Array } {
  let offset = start;
  const parts: Uint8Array[] = [];
  while (offset < input.length) {
    const size = input[offset++];
    if (!size) return { end: offset, data: join(parts) };
    requireMedia(offset + size <= input.length, "Truncated GIF data block");
    parts.push(input.subarray(offset, offset + size)); offset += size;
  }
  throw new MediaProcessingError("Unterminated GIF data blocks");
}
function validateGifLzw(data: Uint8Array, minimum: number, pixels: number, palette: number): void {
  requireMedia(minimum >= 2 && minimum <= 8, "Invalid GIF LZW code size");
  const clear = 1 << minimum, end = clear + 1;
  const lengths = new Uint32Array(4096);
  lengths.fill(1, 0, clear);
  let bit = 0, width = minimum + 1, next = end + 1, previous = -1, produced = 0, initial = true;
  while (bit + width <= data.length * 8) {
    let code = 0;
    for (let index = 0; index < width; index++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << index;
    requireMedia(!initial || code === clear, "GIF LZW must start with a clear code"); initial = false;
    if (code === clear) { width = minimum + 1; next = end + 1; previous = -1; continue; }
    if (code === end) {
      // FFmpeg's GIF encoder emits one zero flush byte when EOI ends on a
      // byte boundary. Permit that precise padding, never arbitrary tail data.
      const used = Math.ceil(bit / 8);
      const flushByte = bit % 8 === 0 && data.length === used + 1 && data[used] === 0;
      requireMedia(produced === pixels && (used === data.length || flushByte), "GIF LZW pixel count or trailing payload is invalid"); return;
    }
    requireMedia(code < next || (code === next && previous >= 0), "Invalid GIF LZW dictionary reference");
    requireMedia(code >= clear || code < palette, "GIF pixel is outside the palette");
    const length = code === next ? lengths[previous] + 1 : lengths[code];
    produced += length;
    requireMedia(length > 0 && produced <= pixels, "GIF LZW expands beyond frame dimensions");
    if (previous >= 0 && next < 4096) {
      lengths[next++] = lengths[previous] + 1;
      if (next === 1 << width && width < 12) width++;
    }
    previous = code;
  }
  throw new MediaProcessingError("GIF LZW end code is missing");
}

function gif(input: Uint8Array): StructuredMedia {
  requireMedia(input.length >= 14 && ["GIF87a", "GIF89a"].includes(ascii(input, 0, 6)), "Invalid GIF header");
  const width = u16(input, 6, true), height = u16(input, 8, true); checkDimensions(width, height);
  const globalColors = input[10] & 128 ? 2 ** ((input[10] & 7) + 1) : 0;
  requireMedia(!globalColors || input[11] < globalColors, "Invalid GIF background index");
  let offset = 13 + 3 * globalColors, frames = 0, duration = 0, delay = 0.1, pixels = 0;
  let transparent: number | undefined;
  let animationLoop: number | undefined;
  requireMedia(offset < input.length, "Truncated GIF palette");
  const parts = [input.subarray(0, offset)], removed: string[] = [];
  while (offset < input.length) {
    const start = offset, introducer = input[offset++];
    if (introducer === 0x3b) {
      requireMedia(frames > 0 && offset === input.length, "GIF has no frame or has trailing payload");
      parts.push(input.subarray(start, offset));
      return structured(join(parts), removed, { width, height, frames, durationSeconds: duration, animationLoop });
    }
    if (introducer === 0x2c) {
      requireMedia(offset + 9 <= input.length, "Truncated GIF image descriptor");
      const x = u16(input, offset, true), y = u16(input, offset + 2, true), w = u16(input, offset + 4, true), h = u16(input, offset + 6, true), flags = input[offset + 8];
      requireMedia(w > 0 && h > 0 && x + w <= width && y + h <= height && !(flags & 0x18), "Invalid GIF frame dimensions or flags");
      const colors = flags & 128 ? 2 ** ((flags & 7) + 1) : globalColors;
      requireMedia(colors > 0 && (transparent === undefined || transparent < colors), "GIF frame has no usable palette");
      offset += 9 + (flags & 128 ? 3 * colors : 0);
      requireMedia(offset < input.length, "Truncated GIF local palette");
      const minimum = input[offset++], blocks = gifBlocks(input, offset);
      validateGifLzw(blocks.data, minimum, w * h, colors);
      offset = blocks.end; frames++; pixels += width * height; duration += delay;
      requireMedia(frames <= LIMITS.animationFrames && pixels <= LIMITS.animationPixels && duration <= LIMITS.animationSeconds, "GIF animation exceeds processing limits");
      transparent = undefined; delay = 0.1;
      parts.push(input.subarray(start, offset)); continue;
    }
    requireMedia(introducer === 0x21 && offset < input.length, "Unknown GIF block");
    const label = input[offset++];
    if (label === 0xf9) {
      requireMedia(offset + 6 <= input.length && input[offset] === 4 && input[offset + 5] === 0 && !(input[offset + 1] & 0xe0) && ((input[offset + 1] >> 2) & 7) <= 3, "Invalid GIF graphics control");
      const centiseconds = u16(input, offset + 2, true);
      // Match the decoder's min_delay=2 / default_delay=10 policy.
      delay = centiseconds < 2 ? 0.1 : centiseconds / 100;
      transparent = input[offset + 1] & 1 ? input[offset + 4] : undefined;
      offset += 6; parts.push(input.subarray(start, offset)); continue;
    }
    requireMedia(label === 0xff || label === 0xfe, "Unsupported GIF extension");
    if (label === 0xff) {
      requireMedia(input[offset] === 11 && offset + 12 <= input.length, "Invalid GIF application extension");
      const identifier = ascii(input, offset + 1, offset + 12); offset += 12;
      const blocks = gifBlocks(input, offset); offset = blocks.end;
      if (identifier === "NETSCAPE2.0" || identifier === "ANIMEXTS1.0") {
        requireMedia(animationLoop === undefined && blocks.data.length === 3 && blocks.data[0] === 1, "Invalid GIF loop extension");
        animationLoop = u16(blocks.data, 1, true);
        parts.push(input.subarray(start, offset));
      } else removed.push("GIF application metadata");
    } else {
      offset = gifBlocks(input, offset).end; removed.push("GIF comment");
    }
  }
  throw new MediaProcessingError("GIF trailer is missing");
}

type RiffChunk = { type: string; start: number; payload: number; size: number; end: number };
function riffChunks(input: Uint8Array, form: string): RiffChunk[] {
  requireMedia(input.length >= 12 && ascii(input, 0, 4) === "RIFF" && ascii(input, 8, 12) === form && u32(input, 4, true) + 8 === input.length, "Invalid RIFF container");
  const chunks: RiffChunk[] = [];
  let offset = 12;
  while (offset < input.length) {
    boundEntries(chunks.length + 1);
    requireMedia(offset + 8 <= input.length, "Truncated RIFF chunk");
    const size = u32(input, offset + 4, true), payload = offset + 8, end = payload + size + (size % 2);
    requireMedia(end <= input.length && (!(size % 2) || input[end - 1] === 0), "Invalid RIFF chunk size or padding");
    chunks.push({ type: ascii(input, offset, offset + 4), start: offset, payload, size, end });
    offset = end;
  }
  return chunks;
}

function webp(input: Uint8Array): StructuredMedia {
  const chunks = riffChunks(input, "WEBP"), removed: string[] = [], parts = [input.subarray(0, 12)];
  let width = 0, height = 0, canvasWidth = 0, canvasHeight = 0, flags = 0, image = false, alpha = false;
  const seen = new Set<string>();
  for (const [index, chunk] of chunks.entries()) {
    const { type, payload, size } = chunk;
    requireMedia(!["ANIM", "ANMF"].includes(type), "Animated WebP requires a supported animation decoder");
    if (["VP8X", "VP8 ", "VP8L", "ALPH", "ICCP", "EXIF", "XMP "].includes(type)) {
      requireMedia(!seen.has(type), "Duplicate WebP chunk"); seen.add(type);
    }
    if (type === "VP8X") {
      requireMedia(index === 0 && size === 10, "Invalid WebP extended header");
      flags = input[payload];
      requireMedia(!(flags & 0xc1) && !(flags & 2) && input[payload + 1] === 0 && input[payload + 2] === 0 && input[payload + 3] === 0, "Unsupported WebP flags");
      canvasWidth = 1 + input[payload + 4] + (input[payload + 5] << 8) + (input[payload + 6] << 16);
      canvasHeight = 1 + input[payload + 7] + (input[payload + 8] << 8) + (input[payload + 9] << 16);
      checkDimensions(canvasWidth, canvasHeight);
      const cleaned = input.slice(chunk.start, chunk.end); cleaned[8] &= ~(0x20 | 8 | 4);
      parts.push(cleaned); continue;
    }
    if (type === "VP8 " || type === "VP8L") {
      requireMedia(!image, "WebP has multiple image payloads"); image = true;
      if (type === "VP8 ") {
        requireMedia(size >= 11 && input[payload + 3] === 0x9d && input[payload + 4] === 1 && input[payload + 5] === 0x2a, "Invalid WebP VP8 frame");
        const tag = input[payload] | (input[payload + 1] << 8) | (input[payload + 2] << 16);
        requireMedia(!(tag & 1) && ((tag >> 1) & 7) <= 3 && (tag & 16) && (tag >>> 5) > 0 && (tag >>> 5) <= size - 10, "Invalid WebP VP8 partition");
        width = u16(input, payload + 6, true); height = u16(input, payload + 8, true);
        requireMedia(!(width & 0xc000) && !(height & 0xc000), "Scaled WebP is unsupported");
      } else {
        requireMedia(size >= 6 && input[payload] === 0x2f && !seen.has("ALPH"), "Invalid WebP lossless header");
        const bits = u32(input, payload + 1, true);
        requireMedia((bits >>> 29) === 0, "Unsupported WebP lossless version");
        width = 1 + (bits & 0x3fff); height = 1 + ((bits >>> 14) & 0x3fff); alpha = !!(bits & 0x10000000);
      }
      checkDimensions(width, height);
    } else if (type === "ALPH") {
      requireMedia(canvasWidth && !image && size > 1 && !(input[payload] & 0xc0) && (input[payload] & 3) <= 1 && ((input[payload] >> 4) & 3) <= 1, "Invalid WebP alpha plane"); alpha = true;
    } else {
      requireMedia(!["ICCP", "EXIF", "XMP "].includes(type) || canvasWidth, "WebP metadata requires an extended header");
      if (type === "ICCP") requireMedia(!image && size > 0 && (flags & 0x20), "Invalid WebP ICC chunk");
      if (type === "EXIF" || type === "XMP ") requireMedia(image && size > 0 && (flags & (type === "EXIF" ? 8 : 4)), "Invalid WebP metadata order");
      removed.push(type === "ICCP" ? "ICC profile" : type === "EXIF" ? "EXIF" : type === "XMP " ? "XMP" : "WebP ancillary metadata");
      continue;
    }
    parts.push(input.subarray(chunk.start, chunk.end));
  }
  requireMedia(image && (!canvasWidth || (width === canvasWidth && height === canvasHeight)), "WebP lacks a complete matching image");
  requireMedia(!canvasWidth || (!!(flags & 0x10) === alpha && !!(flags & 0x20) === seen.has("ICCP") && !!(flags & 8) === seen.has("EXIF") && !!(flags & 4) === seen.has("XMP ")), "WebP feature flags do not match chunks");
  const output = join(parts); put32(output, 4, output.length - 8, true);
  return structured(output, removed, { width, height, frames: 1 });
}

function mp3(input: Uint8Array): StructuredMedia {
  let start = 0, end = input.length;
  const removed: string[] = [];
  while (start + 10 <= end && ascii(input, start, start + 3) === "ID3") {
    const version = input[start + 3], flags = input[start + 5];
    requireMedia([2, 3, 4].includes(version) && input[start + 4] !== 255 && !(flags & (version === 2 ? 0x3f : version === 3 ? 0x1f : 0x0f)), "Invalid ID3 header");
    const sizes = input.subarray(start + 6, start + 10);
    requireMedia([...sizes].every((byte) => byte < 128), "Invalid ID3 size");
    const size = (sizes[0] << 21) | (sizes[1] << 14) | (sizes[2] << 7) | sizes[3];
    const footer = version === 4 && (flags & 16) ? 10 : 0;
    requireMedia(start + 10 + size + footer <= end, "Truncated ID3 metadata");
    if (footer) requireMedia(ascii(input, start + 10 + size, start + 13 + size) === "3DI", "Invalid ID3 footer");
    start += 10 + size + footer; removed.push("ID3v2");
  }
  if (end - start >= 128 && ascii(input, end - 128, end - 125) === "TAG") { end -= 128; removed.push("ID3v1"); }
  if (end - start >= 32 && ascii(input, end - 32, end - 24) === "APETAGEX") {
    const size = u32(input, end - 20, true), flags = u32(input, end - 12, true);
    requireMedia(size >= 32 && size <= end - start, "Invalid APE metadata size");
    end -= size;
    if (flags & 0x80000000) { requireMedia(end - 32 >= start && ascii(input, end - 32, end - 24) === "APETAGEX", "Missing APE header"); end -= 32; }
    removed.push("APE tag");
  }
  let offset = start, frames = 0, duration = 0, streamVersion = -1, streamRate = 0, streamChannels = 0;
  while (offset < end) {
    requireMedia(offset + 4 <= end && input[offset] === 255 && (input[offset + 1] & 0xe0) === 0xe0, "Invalid MP3 frame chain or trailing payload");
    const version = (input[offset + 1] >> 3) & 3, layer = (input[offset + 1] >> 1) & 3, rateIndex = (input[offset + 2] >> 2) & 3, bitrateIndex = input[offset + 2] >> 4;
    requireMedia(version !== 1 && layer === 1 && rateIndex !== 3 && bitrateIndex > 0 && bitrateIndex < 15 && (input[offset + 3] & 3) !== 2, "Unsupported MP3 frame header");
    const bitrates = version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const rate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4), channels = (input[offset + 3] >> 6) === 3 ? 1 : 2;
    const size = Math.floor((version === 3 ? 144000 : 72000) * bitrates[bitrateIndex] / rate) + ((input[offset + 2] >> 1) & 1);
    const headerSize = 4 + (input[offset + 1] & 1 ? 0 : 2) + (version === 3 ? (channels === 1 ? 17 : 32) : (channels === 1 ? 9 : 17));
    requireMedia(size > headerSize && offset + size <= end, "Truncated MP3 audio frame");
    requireMedia(streamVersion === -1 || (streamVersion === version && streamRate === rate && streamChannels === channels), "MP3 changes codec parameters mid-stream");
    streamVersion = version; streamRate = rate; streamChannels = channels;
    frames++; duration += (version === 3 ? 1152 : 576) / rate;
    requireMedia(frames <= LIMITS.audioPackets && duration <= LIMITS.audioSeconds, "MP3 duration exceeds processing limits");
    offset += size;
  }
  requireMedia(frames >= 2, "MP3 requires complete audio frames");
  return structured(input.slice(start, end), removed, { durationSeconds: duration });
}

function wav(input: Uint8Array): StructuredMedia {
  const chunks = riffChunks(input, "WAVE"), removed: string[] = [], parts = [input.subarray(0, 12)];
  let format = false, data = false, blockAlign = 0, rate = 0, samples = 0;
  for (const chunk of chunks) {
    const { type, payload, size } = chunk;
    if (type === "fmt ") {
      requireMedia(!format && !data && size >= 16, "Invalid WAV format chunk"); format = true;
      let code = u16(input, payload, true);
      const channels = u16(input, payload + 2, true), bits = u16(input, payload + 14, true);
      rate = u32(input, payload + 4, true); blockAlign = u16(input, payload + 12, true);
      requireMedia(channels >= 1 && channels <= LIMITS.channels && rate >= 8000 && rate <= LIMITS.sampleRate, "WAV channels or sample rate exceed limits");
      if (code === 0xfffe) {
        requireMedia(size === 40 && u16(input, payload + 16, true) === 22, "Unsupported extensible WAV format");
        const validBits = u16(input, payload + 18, true);
        requireMedia(validBits > 0 && validBits <= bits && Buffer.from(input.subarray(payload + 26, payload + 40)).equals(Buffer.from([0, 0, 0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113])), "Unsupported WAV subformat");
        code = u16(input, payload + 24, true);
      } else requireMedia(size === 16 || (size === 18 && u16(input, payload + 16, true) === 0), "Unsupported WAV format extension");
      requireMedia((code === 1 && [8, 16, 24, 32].includes(bits)) || (code === 3 && [32, 64].includes(bits)), "Only PCM or IEEE float WAV is supported");
      requireMedia(blockAlign === channels * bits / 8 && u32(input, payload + 8, true) === rate * blockAlign, "WAV alignment or byte rate is inconsistent");
    } else if (type === "data") {
      requireMedia(format && !data && size > 0 && size % blockAlign === 0, "WAV has empty, duplicate, or partial sample data"); data = true; samples = size / blockAlign;
      requireMedia(samples / rate <= LIMITS.audioSeconds, "WAV duration exceeds processing limits");
    } else {
      if (type === "fact") { requireMedia(size >= 4, "Invalid WAV fact chunk"); continue; }
      const kind: Record<string, string> = { LIST: "WAV INFO metadata", bext: "Broadcast WAV metadata", iXML: "WAV XML metadata", "ID3 ": "ID3", "id3 ": "ID3", "XMP ": "XMP" };
      removed.push(kind[type] ?? "WAV ancillary metadata"); continue;
    }
    parts.push(input.subarray(chunk.start, chunk.end));
  }
  requireMedia(format && data, "WAV has no valid format and audio data");
  const output = join(parts); put32(output, 4, output.length - 8, true);
  return structured(output, removed, { durationSeconds: samples / rate });
}

type Box = { type: string; start: number; payload: number; end: number };
function mp4(input: Uint8Array, quicktime: boolean): StructuredMedia {
  const output = input.slice(), removed: string[] = [];
  let boxCount = 0;
  function boxes(start: number, end: number): Box[] {
    const found: Box[] = [];
    let offset = start;
    while (offset < end) {
      requireMedia(++boxCount <= 4096 && offset + 8 <= end, "MP4 box limit or truncated header");
      const size32 = u32(input, offset), type = ascii(input, offset + 4, offset + 8);
      let size = size32, header = 8;
      if (size32 === 1) {
        requireMedia(offset + 16 <= end, "Truncated MP4 extended size");
        const large = new DataView(input.buffer, input.byteOffset + offset + 8, 8).getBigUint64(0);
        requireMedia(large <= BigInt(input.length), "MP4 box exceeds file size");
        size = Number(large); header = 16;
      } else if (size32 === 0) {
        requireMedia(type === "mdat", "Only final MP4 media data may extend to EOF"); size = end - offset;
      }
      requireMedia(size >= header && offset + size <= end, "Invalid MP4 box bounds");
      found.push({ type, start: offset, payload: offset + header, end: offset + size }); offset += size;
    }
    return found;
  }
  function one(entries: Box[], type: string): Box {
    const matching = entries.filter((box) => box.type === type);
    requireMedia(matching.length === 1, "MP4 required box is missing or duplicated"); return matching[0];
  }
  function zeroUnknown(entries: Box[], allowed: string[]): void {
    for (const box of entries) if (!allowed.includes(box.type)) {
      requireMedia(!["moof", "mvex", "pssh", "sinf", "senc", "saiz", "saio"].includes(box.type), "Fragmented or encrypted MP4 is unsupported");
      output.set(Buffer.from("free"), box.start + 4);
      output.fill(0, box.payload, box.end);
      // Include free/skip/uuid: these can contain arbitrary identifiers too.
      if (input.subarray(box.payload, box.end).some((byte) => byte !== 0)) removed.push("MP4/QuickTime metadata");
    }
  }
  function fullBox(box: Box, minimum: number): number {
    requireMedia(box.end - box.payload >= minimum && input[box.payload] === 0 && u32(input, box.payload) === 0, "Unsupported MP4 table version or flags");
    return box.payload + 4;
  }
  function countedTable(box: Box, width: number, max: number = LIMITS.containerEntries): { count: number; start: number } {
    const position = fullBox(box, 8), count = u32(input, position);
    requireMedia(count <= max && box.end - (position + 4) === count * width, "Invalid MP4 sample table length");
    return { count, start: position + 4 };
  }
  function mediaTime(box: Box): { scale: number; duration: number } {
    requireMedia(box.end - box.payload >= 20 && input[box.payload] <= 1, "Invalid MP4 time header");
    const version = input[box.payload], scaleOffset = box.payload + (version ? 20 : 12);
    requireMedia(scaleOffset + (version ? 12 : 8) <= box.end, "Truncated MP4 time fields");
    const scale = u32(input, scaleOffset);
    const duration = version ? Number(new DataView(input.buffer, input.byteOffset + scaleOffset + 4, 8).getBigUint64(0)) : u32(input, scaleOffset + 4);
    requireMedia(scale > 0 && Number.isSafeInteger(duration) && duration > 0 && duration / scale <= LIMITS.videoSeconds + 1, "MP4 duration or timescale is invalid");
    return { scale, duration };
  }
  const root = boxes(0, input.length);
  requireMedia(root[0]?.type === "ftyp", "MP4 must begin with a file type box");
  const ftyp = one(root, "ftyp");
  requireMedia(ftyp.end - ftyp.payload >= 8 && (ftyp.end - ftyp.payload) % 4 === 0, "Invalid MP4 brands");
  const major = ascii(input, ftyp.payload, ftyp.payload + 4);
  requireMedia(quicktime ? major === "qt  " : ["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V "].includes(major), "Unsupported MP4 major brand");
  const mediaData = root.filter((box) => box.type === "mdat");
  requireMedia(mediaData.length > 0 && mediaData.every((box) => box.end > box.payload), "MP4 has no media payload");
  const moov = one(root, "moov"), movie = boxes(moov.payload, moov.end);
  mediaTime(one(movie, "mvhd"));
  const tracks = movie.filter((box) => box.type === "trak");
  requireMedia(tracks.length >= 1 && tracks.length <= 2, "MP4 has unsupported track count");
  zeroUnknown(root, ["ftyp", "moov", "mdat"]); zeroUnknown(movie, ["mvhd", "trak"]);
  let videoTracks = 0, audioTracks = 0, videoFrames = 0, width = 0, height = 0, durationSeconds = 0;
  const occupied: Array<{ start: number; end: number }> = [];
  for (const track of tracks) {
    const trackBoxes = boxes(track.payload, track.end), tkhd = one(trackBoxes, "tkhd"), mdia = one(trackBoxes, "mdia");
    requireMedia(input[tkhd.payload] <= 1 && tkhd.end - tkhd.payload === (input[tkhd.payload] ? 96 : 84), "Invalid MP4 track header");
    const media = boxes(mdia.payload, mdia.end), mdhd = one(media, "mdhd"), hdlr = one(media, "hdlr"), minf = one(media, "minf");
    const time = mediaTime(mdhd);
    requireMedia(hdlr.end - hdlr.payload >= 24 && input[hdlr.payload] === 0, "Invalid MP4 media handler");
    const handler = ascii(input, hdlr.payload + 8, hdlr.payload + 12);
    requireMedia(handler === "vide" || handler === "soun", "Only video and audio MP4 tracks are supported");
    if (handler === "vide") videoTracks++; else audioTracks++;
    const info = boxes(minf.payload, minf.end), dinf = one(info, "dinf"), stbl = one(info, "stbl");
    const references = boxes(dinf.payload, dinf.end), dref = one(references, "dref");
    const drefStart = fullBox(dref, 8);
    requireMedia(u32(input, drefStart) === 1, "MP4 external data references are forbidden");
    const urls = boxes(drefStart + 4, dref.end);
    requireMedia(urls.length === 1 && urls[0].type === "url " && urls[0].end - urls[0].payload === 4 && u32(input, urls[0].payload) === 1, "MP4 must contain only self-contained data references");
    const table = boxes(stbl.payload, stbl.end), stsd = one(table, "stsd"), stsz = one(table, "stsz");
    const descriptions = fullBox(stsd, 8);
    requireMedia(u32(input, descriptions) === 1, "MP4 changes codec descriptions");
    const codecs = boxes(descriptions + 4, stsd.end);
    requireMedia(codecs.length === 1, "Invalid MP4 codec description");
    const codec = codecs[0];
    requireMedia(codec.end - codec.payload >= 8 && u16(input, codec.payload + 6) === 1, "Invalid MP4 codec data reference");
    let children: Box[];
    if (handler === "vide") {
      requireMedia(["avc1", "avc3", "hvc1", "hev1", "mp4v"].includes(codec.type) && codec.end - codec.payload >= 78, "Unsupported MP4 video codec");
      width = u16(input, codec.payload + 24); height = u16(input, codec.payload + 26); checkDimensions(width, height, true);
      // The sample entry's compressor-name field is not codec configuration.
      if (input.subarray(codec.payload + 42, codec.payload + 74).some((byte) => byte !== 0)) removed.push("MP4/QuickTime metadata");
      output.fill(0, codec.payload + 42, codec.payload + 74);
      children = boxes(codec.payload + 78, codec.end);
      const config = one(children, codec.type.startsWith("avc") ? "avcC" : ["hvc1", "hev1"].includes(codec.type) ? "hvcC" : "esds");
      requireMedia(config.end - config.payload >= (config.type === "avcC" ? 7 : config.type === "hvcC" ? 23 : 8), "Truncated MP4 codec configuration");
      zeroUnknown(children, ["avcC", "hvcC", "esds", "pasp", "clap", "colr", "btrt"]);
    } else {
      requireMedia(["mp4a", ".mp3", "sowt", "twos", "lpcm"].includes(codec.type) && codec.end - codec.payload >= 28, "Unsupported MP4 audio codec");
      const version = u16(input, codec.payload + 8);
      requireMedia(version <= 1 && codec.end - codec.payload >= (version ? 44 : 28), "Unsupported MOV audio description");
      const channels = u16(input, codec.payload + 16), rate = u32(input, codec.payload + 24) >>> 16;
      requireMedia(channels >= 1 && channels <= LIMITS.channels && rate >= 8000 && rate <= LIMITS.sampleRate, "MP4 audio parameters exceed limits");
      children = boxes(codec.payload + (version ? 44 : 28), codec.end);
      zeroUnknown(children, ["esds", "wave", "chan", "btrt"]);
    }
    const sizesStart = fullBox(stsz, 12), constantSize = u32(input, sizesStart), sampleCount = u32(input, sizesStart + 4);
    const maxSamples = handler === "vide" ? LIMITS.videoFrames : LIMITS.audioPackets;
    requireMedia(sampleCount > 0 && sampleCount <= maxSamples && stsz.end - (sizesStart + 8) === (constantSize ? 0 : sampleCount * 4), "Invalid MP4 sample sizes");
    const sizes = (index: number) => constantSize || u32(input, sizesStart + 8 + index * 4);
    const timing = countedTable(one(table, "stts"), 8, sampleCount);
    let timedSamples = 0, ticks = 0;
    for (let index = 0; index < timing.count; index++) {
      const count = u32(input, timing.start + 8 * index), delta = u32(input, timing.start + 8 * index + 4);
      requireMedia(count > 0 && delta > 0, "MP4 sample timing is invalid"); timedSamples += count; ticks += count * delta;
    }
    requireMedia(timedSamples === sampleCount && Number.isSafeInteger(ticks) && ticks / time.scale <= LIMITS.videoSeconds + 1, "MP4 sample timing does not match media");
    if (handler === "vide") {
      videoFrames = sampleCount; durationSeconds = ticks / time.scale;
      requireMedia(sampleCount / durationSeconds <= LIMITS.frameRate + 0.01, "MP4 frame rate exceeds processing limits");
    }
    const offsetBoxes = table.filter((box) => box.type === "stco" || box.type === "co64");
    requireMedia(offsetBoxes.length === 1, "MP4 chunk offsets are missing or duplicated");
    const offsetBox = offsetBoxes[0], offsets = countedTable(offsetBox, offsetBox.type === "stco" ? 4 : 8, sampleCount);
    const mapping = countedTable(one(table, "stsc"), 12, offsets.count);
    requireMedia(offsets.count > 0 && mapping.count > 0, "MP4 has no sample chunks");
    let sampleIndex = 0, mappingIndex = 0;
    for (let chunk = 1; chunk <= offsets.count; chunk++) {
      if (mappingIndex + 1 < mapping.count && u32(input, mapping.start + (mappingIndex + 1) * 12) === chunk) mappingIndex++;
      const position = mapping.start + mappingIndex * 12, first = u32(input, position), count = u32(input, position + 4), description = u32(input, position + 8);
      requireMedia((mappingIndex > 0 || first === 1) && first <= chunk && count > 0 && description === 1 && sampleIndex + count <= sampleCount, "Invalid MP4 chunk-to-sample mapping");
      if (mappingIndex + 1 < mapping.count) requireMedia(u32(input, mapping.start + (mappingIndex + 1) * 12) > first, "Unordered MP4 sample chunks");
      const offsetPosition = offsets.start + (chunk - 1) * (offsetBox.type === "stco" ? 4 : 8);
      const start = offsetBox.type === "stco" ? u32(input, offsetPosition) : Number(new DataView(input.buffer, input.byteOffset + offsetPosition, 8).getBigUint64(0));
      let bytes = 0;
      for (let index = 0; index < count; index++) { const size = sizes(sampleIndex++); requireMedia(size > 0, "Empty MP4 sample"); bytes += size; }
      requireMedia(Number.isSafeInteger(start) && mediaData.some((box) => start >= box.payload && start + bytes <= box.end), "MP4 sample points outside embedded media data");
      occupied.push({ start, end: start + bytes });
    }
    requireMedia(sampleIndex === sampleCount && mappingIndex === mapping.count - 1, "MP4 samples are not fully referenced");
    for (const box of table) {
      if (box.type === "stss") {
        const sync = countedTable(box, 4, sampleCount); let previous = 0;
        for (let index = 0; index < sync.count; index++) { const value = u32(input, sync.start + index * 4); requireMedia(value > previous && value <= sampleCount, "Invalid MP4 keyframe index"); previous = value; }
      }
      if (box.type === "ctts") {
        requireMedia(box.end - box.payload >= 8 && input[box.payload] <= 1, "Invalid MP4 composition table");
        const count = u32(input, box.payload + 4); requireMedia(count <= sampleCount && box.end - box.payload === 8 + 8 * count, "Invalid MP4 composition offsets");
        let samples = 0;
        for (let index = 0; index < count; index++) { const value = u32(input, box.payload + 8 + 8 * index); requireMedia(value > 0); samples += value; }
        requireMedia(samples === sampleCount, "MP4 composition sample count mismatch");
      }
    }
    zeroUnknown(trackBoxes, ["tkhd", "mdia", "edts"]); zeroUnknown(media, ["mdhd", "hdlr", "minf"]);
    zeroUnknown(info, ["vmhd", "smhd", "dinf", "stbl"]); zeroUnknown(references, ["dref"]);
    zeroUnknown(table, ["stsd", "stsz", "stts", "stsc", "stco", "co64", "stss", "ctts", "sdtp"]);
    const edit = trackBoxes.filter((box) => box.type === "edts");
    requireMedia(edit.length <= 1, "Duplicate MP4 edits");
    if (edit.length) {
      const edits = boxes(edit[0].payload, edit[0].end); zeroUnknown(edits, ["elst"]);
      const elst = one(edits, "elst"); requireMedia(elst.end - elst.payload >= 8 && input[elst.payload] <= 1, "Invalid MP4 edit list");
      const count = u32(input, elst.payload + 4);
      requireMedia(count <= 16 && elst.end - elst.payload === 8 + count * (input[elst.payload] ? 20 : 12), "MP4 edit list exceeds limits");
    }
  }
  occupied.sort((a, b) => a.start - b.start);
  for (let index = 1; index < occupied.length; index++) requireMedia(occupied[index].start >= occupied[index - 1].end, "Overlapping MP4 samples");
  requireMedia(videoTracks === 1 && audioTracks <= 1 && videoFrames > 0, "MP4 requires exactly one video track");
  return structured(output, removed, { width, height, frames: videoFrames, durationSeconds });
}

/** Sanitizes explicit metadata, validates container/pixel structure, never attests decoding. */
export function inspectMediaStructure(input: Uint8Array, mimeType: SupportedMediaMimeType): StructuredMedia {
  switch (mimeType) {
    case "image/jpeg": return jpeg(input);
    case "image/png": return png(input);
    case "image/gif": return gif(input);
    case "image/webp": return webp(input);
    case "audio/mpeg": return mp3(input);
    case "audio/wav": return wav(input);
    case "video/mp4": return mp4(input, false);
    case "video/quicktime": return mp4(input, true);
  }
}
