import childProcess, { type spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, statSync, truncateSync } from "node:fs";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MEDIA_POLICY, sniffMediaMimeType, type SupportedMediaMimeType } from "./media-policy.server";
import { inspectMediaStructure } from "./media-structure.server";
import { MediaProcessingError, stripMediaMetadata } from "./metadata-stripper.server";
import { renderMediaWatermark } from "./media-decoder.server";
import {
  bytesJoin, mediaWithMetadata, mp4Box, pngChunk, PRIVATE_METADATA_MARKER,
  riffChunk, riffFile, textBytes, uint32, validMediaFixture, validMediaVariant,
} from "./fixtures.server.test-support";

const TYPES: SupportedMediaMimeType[] = ["image/jpeg", "image/png", "image/gif", "image/webp", "audio/mpeg", "audio/wav", "video/mp4", "video/quicktime"];
const actualSpawn = childProcess.spawn;
const spawnMock = vi.spyOn(childProcess, "spawn");

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("real media decoding and privacy reconstruction", () => {
  it.each(["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4"] as const)(
    "renders a separate, structurally valid watermark derivative for %s",
    async (mime) => {
      const canonical = await stripMediaMetadata(validMediaFixture(mime), mime);
      const marked = await renderMediaWatermark(canonical.bytes, mime);
      expect(sniffMediaMimeType(marked.bytes)).toBe(mime);
      expect(marked.bytes).not.toEqual(canonical.bytes);
      const before = inspectMediaStructure(canonical.bytes, mime);
      expect(marked).toMatchObject({
        width: before.width,
        height: before.height,
        frames: before.frames,
      });
    },
    20_000
  );

  it("rejects a watermark font path that could inject an FFmpeg filter", async () => {
    const canonical = await stripMediaMetadata(validMediaFixture("image/jpeg"), "image/jpeg");
    vi.stubEnv("MEDIA_WATERMARK_FONT_PATH", "/tmp/font.ttf;movie=/private/file[out]");
    await expect(renderMediaWatermark(canonical.bytes, "image/jpeg")).rejects.toMatchObject({
      reason: "processor_unavailable",
    });
  });

  it.each(TYPES)("fully decodes and rebuilds a real %s fixture without changing MIME", async (mime) => {
    const input = validMediaFixture(mime);
    const result = await stripMediaMetadata(input, mime);
    expect(result.metadataStripped).toBe(true);
    expect(result.bytes.length).toBeGreaterThan(20);
    expect(sniffMediaMimeType(result.bytes)).toBe(mime);
    const source = inspectMediaStructure(input, mime), output = inspectMediaStructure(result.bytes, mime);
    expect(output.frames).toBe(source.frames);
    expect(output.width).toBe(source.width);
    expect(output.height).toBe(source.height);
    const calls = spawnMock.mock.calls;
    expect(calls.some(([, args]) => args?.includes("-count_frames"))).toBe(true);
    expect(calls.some(([, args]) => args?.includes("-xerror"))).toBe(true);
  }, 15_000);

  it.each(TYPES)("physically removes explicit metadata from a valid %s", async (mime) => {
    const input = mediaWithMetadata(mime);
    expect(Buffer.from(input).includes(PRIVATE_METADATA_MARKER)).toBe(true);
    const result = await stripMediaMetadata(input, mime);
    expect(result.metadataRemoved).toBe(true);
    expect(result.removedMetadataKinds.length).toBeGreaterThan(0);
    expect(Buffer.from(result.bytes).includes(PRIVATE_METADATA_MARKER)).toBe(false);
    expect(sniffMediaMimeType(result.bytes)).toBe(mime);
    expect(result.removedMetadataKinds.join()).not.toContain(PRIVATE_METADATA_MARKER);
  }, 15_000);

  it("does not claim metadata was observed in a clean WebP", async () => {
    const result = await stripMediaMetadata(validMediaFixture("image/webp"), "image/webp");
    expect(result).toMatchObject({ metadataStripped: true, metadataRemoved: false, removedMetadataKinds: [] });
  });

  it("preserves every frame of an animated GIF instead of keeping only its first image", async () => {
    const result = await stripMediaMetadata(validMediaFixture("image/gif"), "image/gif");
    expect(inspectMediaStructure(result.bytes, "image/gif")).toMatchObject({ frames: 2, durationSeconds: 0.2 });
  });

  it.each([
    ["mp4_audio", "video/mp4"], ["mov_audio", "video/quicktime"],
    ["webp_lossy", "image/webp"], ["gif_lzw", "image/gif"],
  ] as const)("decodes the real %s codec/container variant", async (variant, mime) => {
    const input = validMediaVariant(variant);
    const source = inspectMediaStructure(input, mime);
    const result = await stripMediaMetadata(input, mime);
    const output = inspectMediaStructure(result.bytes, mime);
    expect(output.frames).toBe(source.frames);
    expect(output.animationLoop).toBe(source.animationLoop);
    expect(sniffMediaMimeType(result.bytes)).toBe(mime);
  });

  it("re-encodes video essence and removes codec SEI instead of stream-copying it", async () => {
    const input = validMediaFixture("video/mp4");
    expect(Buffer.from(input).includes("x264")).toBe(true);
    const result = await stripMediaMetadata(input, "video/mp4");
    expect(Buffer.from(result.bytes).includes("x264")).toBe(false);
    const invocation = spawnMock.mock.calls.find(([, args]) => args?.includes("-xerror"))!;
    expect(invocation[1]).toContain("filter_units=remove_types=6");
    expect(invocation[1]).not.toContain("copy");
  });
});

describe("seven original false-positive regressions", () => {
  const payload = textBytes("PRIVATE_PAYLOAD");
  const fakes: Array<[SupportedMediaMimeType, Uint8Array]> = [
    ["image/jpeg", bytesJoin(Uint8Array.from([255, 216, 255, 218, 0, 2]), payload)],
    ["image/png", bytesJoin(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", new Uint8Array(13)), pngChunk("IEND", new Uint8Array()))],
    ["image/gif", bytesJoin(textBytes("GIF89a"), new Uint8Array(7), Uint8Array.from([0x3b]))],
    ["image/webp", riffFile("WEBP", riffChunk("ICCP", textBytes("PII!")))],
    ["audio/mpeg", bytesJoin(Uint8Array.from([255, 251, 144, 100]), payload)],
    ["audio/wav", riffFile("WAVE", riffChunk("fmt ", new Uint8Array(16)), riffChunk("data", new Uint8Array()))],
    ["video/mp4", bytesJoin(mp4Box("ftyp", textBytes("isom0000")), mp4Box("mdat", new Uint8Array()))],
  ];
  it.each(fakes)("rejects the old %s signature-only payload before starting a decoder", async (mime, input) => {
    await expect(stripMediaMetadata(input, mime)).rejects.toBeInstanceOf(MediaProcessingError);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe("container bounds, complete pixels and actual compressed essence", () => {
  it.each(["image/jpeg", "image/png", "image/gif", "image/webp", "audio/mpeg", "audio/wav", "video/mp4", "video/quicktime"] as const)("rejects trailing arbitrary bytes in %s", async (mime) => {
    await expect(stripMediaMetadata(bytesJoin(validMediaFixture(mime), textBytes("UNFRAMED_PRIVATE_PAYLOAD")), mime)).rejects.toBeInstanceOf(MediaProcessingError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects PNG pixels with a valid CRC but missing or invalid compressed scanlines", async () => {
    const valid = validMediaFixture("image/png");
    const signatureAndHeader = valid.subarray(0, 33);
    const noData = bytesJoin(signatureAndHeader, pngChunk("IEND", new Uint8Array()));
    const garbage = bytesJoin(signatureAndHeader, pngChunk("IDAT", textBytes("PRIVATE_PAYLOAD")), pngChunk("IEND", new Uint8Array()));
    for (const bytes of [noData, garbage]) await expect(stripMediaMetadata(bytes, "image/png")).rejects.toBeInstanceOf(MediaProcessingError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects dimensions bombs before decompression or decoder invocation", async () => {
    const png = validMediaFixture("image/png"), header = png.slice(16, 29);
    new DataView(header.buffer).setUint32(0, 100_000);
    await expect(stripMediaMetadata(bytesJoin(png.subarray(0, 8), pngChunk("IHDR", header), png.subarray(33)), "image/png")).rejects.toMatchObject({ reason: "resource_limit" });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects unknown critical PNG chunks and CRC corruption", async () => {
    const input = validMediaFixture("image/png");
    const unknown = bytesJoin(input.subarray(0, 33), pngChunk("ABCD", new Uint8Array()), input.subarray(33));
    const corrupted = input.slice(); corrupted[29] ^= 1;
    for (const bytes of [unknown, corrupted]) await expect(stripMediaMetadata(bytes, "image/png")).rejects.toBeInstanceOf(MediaProcessingError);
  });

  it("removes unrecognized ancillary metadata rather than relying on a small tag denylist", async () => {
    const input = validMediaFixture("image/png");
    const privateChunk = pngChunk("ruSt", textBytes(PRIVATE_METADATA_MARKER));
    const result = await stripMediaMetadata(bytesJoin(input.subarray(0, -12), privateChunk, input.subarray(-12)), "image/png");
    expect(result.removedMetadataKinds).toContain("PNG ancillary metadata");
    expect(Buffer.from(result.bytes).includes(PRIVATE_METADATA_MARKER)).toBe(false);
  });

  it("rejects unsupported animation and fragmented video instead of flattening them", async () => {
    const png = validMediaFixture("image/png");
    const apng = bytesJoin(png.subarray(0, 33), pngChunk("acTL", bytesJoin(uint32(2), uint32(0))), png.subarray(33));
    const webp = riffFile("WEBP", riffChunk("VP8X", Uint8Array.from([2, 0, 0, 0, 15, 0, 0, 15, 0, 0])), validMediaFixture("image/webp").subarray(12));
    const fragmented = bytesJoin(validMediaFixture("video/mp4"), mp4Box("moof", new Uint8Array()));
    for (const [input, mime] of [[apng, "image/png"], [webp, "image/webp"], [fragmented, "video/mp4"]] as const) {
      await expect(stripMediaMetadata(input, mime)).rejects.toBeInstanceOf(MediaProcessingError);
    }
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects a GIF with invalid LZW codes, even when descriptors and subblocks fit", async () => {
    const input = validMediaFixture("image/gif");
    const image = input.indexOf(0x2c, 13 + 768);
    expect(image).toBeGreaterThan(0);
    input[image + 12] = 255;
    await expect(stripMediaMetadata(input, "image/gif")).rejects.toBeInstanceOf(MediaProcessingError);
  });

  it("rejects a WebP whose valid frame header wraps corrupt encoded pixels", async () => {
    const input = validMediaFixture("image/webp"); input.fill(255, 25, input.length - 1);
    // The container still passes. Only the mature codec decoder rejects it.
    expect(() => inspectMediaStructure(input, "image/webp")).not.toThrow();
    await expect(stripMediaMetadata(input, "image/webp")).rejects.toBeInstanceOf(MediaProcessingError);
    expect(spawnMock).toHaveBeenCalled();
  });

  it("rejects MP3 frames with valid boundaries but corrupt side information", async () => {
    const input = validMediaFixture("audio/mpeg");
    // First MPEG-1 Layer III frame's side information, not the four-byte header.
    input.fill(255, 4, 21);
    expect(() => inspectMediaStructure(input, "audio/mpeg")).not.toThrow();
    await expect(stripMediaMetadata(input, "audio/mpeg")).rejects.toBeInstanceOf(MediaProcessingError);
  });

  it("rejects a WAV whose sample block alignment is inconsistent", async () => {
    const input = validMediaFixture("audio/wav"), fmt = Buffer.from(input).indexOf("fmt ");
    new DataView(input.buffer).setUint16(fmt + 20, 3, true);
    await expect(stripMediaMetadata(input, "audio/wav")).rejects.toBeInstanceOf(MediaProcessingError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects MP4 sample offsets outside mdat", async () => {
    const input = validMediaFixture("video/mp4"), stco = Buffer.from(input).indexOf("stco");
    expect(stco).toBeGreaterThan(0); input.set(uint32(input.length + 100), stco + 12);
    await expect(stripMediaMetadata(input, "video/mp4")).rejects.toBeInstanceOf(MediaProcessingError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects indexed frame counts above the video cap before processing", async () => {
    const input = validMediaFixture("video/mp4"), stsz = Buffer.from(input).indexOf("stsz");
    expect(stsz).toBeGreaterThan(0); input.set(uint32(18_001), stsz + 12);
    await expect(stripMediaMetadata(input, "video/mp4")).rejects.toBeInstanceOf(MediaProcessingError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it.each(["video/mp4", "video/quicktime"] as const)("rejects non-self-contained %s references before FFmpeg can read them", async (mime) => {
    const input = validMediaFixture(mime), url = Buffer.from(input).lastIndexOf("url ");
    expect(url).toBeGreaterThan(0); input.set(uint32(0), url + 4);
    await expect(stripMediaMetadata(input, mime)).rejects.toThrow("self-contained");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects corrupt H.264 samples even with otherwise valid movie and sample tables", async () => {
    const input = validMediaFixture("video/mp4"), mdat = Buffer.from(input).indexOf("mdat");
    input.fill(255, mdat + 4);
    expect(() => inspectMediaStructure(input, "video/mp4")).not.toThrow();
    await expect(stripMediaMetadata(input, "video/mp4")).rejects.toBeInstanceOf(MediaProcessingError);
    expect(spawnMock).toHaveBeenCalled();
  });
});

describe("bounded, private, fail-closed process boundary", () => {
  it("uses private temporary files, cleans them, inherits no secrets and disallows external protocols", async () => {
    vi.stubEnv("MEDIA_TEST_SECRET", PRIVATE_METADATA_MARKER);
    const modes: number[] = [];
    spawnMock.mockImplementation((...args: Parameters<typeof spawn>) => {
      const options = args[2]!;
      modes.push(statSync(String(options.cwd)).mode & 0o777);
      if (args[1]?.includes("-i")) modes.push(statSync(String(options.cwd) + "/input.bin").mode & 0o777);
      return actualSpawn(...args);
    });
    try { await stripMediaMetadata(validMediaFixture("video/mp4"), "video/mp4"); }
    finally { spawnMock.mockImplementation(actualSpawn); }
    expect(modes).toContain(0o700); expect(modes).toContain(0o600);
    for (const [, args, options] of spawnMock.mock.calls) {
      expect(options).toMatchObject({ shell: false, stdio: ["ignore", "pipe", "pipe"] });
      expect(options?.env).not.toHaveProperty("MEDIA_TEST_SECRET");
      expect(options?.env).not.toHaveProperty("DATABASE_URL");
      expect(options?.env).not.toHaveProperty("R2_SECRET_ACCESS_KEY");
      expect(existsSync(String(options?.cwd))).toBe(false);
      if (args?.includes("-i")) {
        expect(args).toEqual(expect.arrayContaining(["-protocol_whitelist", "file,pipe", "-enable_drefs", "0", "-use_absolute_path", "-codec_whitelist", "-format_whitelist", "-max_alloc", "-max_pixels"]));
      }
    }
  });

  it.each(["MEDIA_FFMPEG_PATH", "MEDIA_FFPROBE_PATH"])("fails closed and cleans up when %s is absent", async (variable) => {
    vi.stubEnv(variable, "/nonexistent/safespace-processor");
    await expect(stripMediaMetadata(validMediaFixture("image/jpeg"), "image/jpeg")).rejects.toMatchObject({ reason: "processor_unavailable" });
    for (const [, , options] of spawnMock.mock.calls) expect(existsSync(String(options?.cwd))).toBe(false);
  });

  it("rejects unsafe binary configuration instead of interpreting shell syntax", async () => {
    vi.stubEnv("MEDIA_FFMPEG_PATH", "ffmpeg; touch unsafe");
    await expect(stripMediaMetadata(validMediaFixture("image/jpeg"), "image/jpeg")).rejects.toMatchObject({ reason: "processor_unavailable" });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("fails closed when the per-process concurrency limit is reached", async () => {
    vi.stubEnv("MEDIA_PROCESSING_MAX_CONCURRENT", "1");
    const running = stripMediaMetadata(validMediaFixture("image/jpeg"), "image/jpeg");
    await expect(stripMediaMetadata(validMediaFixture("image/jpeg"), "image/jpeg")).rejects.toMatchObject({ reason: "resource_limit" });
    await running;
  });

  it("kills a stalled decoder at the wall deadline and removes its private directory", async () => {
    vi.stubEnv("MEDIA_PROCESSING_TIMEOUT_MS", "1000");
    const stalled = new EventEmitter() as ReturnType<typeof spawn>;
    Object.assign(stalled, { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => { queueMicrotask(() => stalled.emit("close", null, "SIGKILL")); return true; }) });
    spawnMock.mockImplementation((...args: Parameters<typeof spawn>) => args[1]?.includes("-show_entries") ? stalled : actualSpawn(...args));
    try {
      await expect(stripMediaMetadata(validMediaFixture("image/jpeg"), "image/jpeg")).rejects.toMatchObject({ reason: "resource_limit" });
      expect(stalled.kill).toHaveBeenCalledWith("SIGKILL");
      for (const [, , options] of spawnMock.mock.calls) expect(existsSync(String(options?.cwd))).toBe(false);
    } finally { spawnMock.mockImplementation(actualSpawn); }
  }, 5000);

  it("kills a decoder that exceeds the diagnostic/output bound, without exposing its text", async () => {
    const noisy = new EventEmitter() as ReturnType<typeof spawn>;
    Object.assign(noisy, { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => { queueMicrotask(() => noisy.emit("close", null, "SIGKILL")); return true; }) });
    spawnMock.mockImplementation((...args: Parameters<typeof spawn>) => {
      if (!args[1]?.includes("-show_entries")) return actualSpawn(...args);
      queueMicrotask(() => noisy.stdout!.emit("data", Buffer.alloc(300 * 1024, "PRIVATE_METADATA_927")));
      return noisy;
    });
    try {
      const error = await stripMediaMetadata(validMediaFixture("image/jpeg"), "image/jpeg").catch((error: unknown) => error);
      expect(error).toMatchObject({ reason: "resource_limit" });
      expect(String(error)).not.toContain(PRIVATE_METADATA_MARKER);
      expect(noisy.kill).toHaveBeenCalledWith("SIGKILL");
      for (const [, , options] of spawnMock.mock.calls) expect(existsSync(String(options?.cwd))).toBe(false);
    } finally { spawnMock.mockImplementation(actualSpawn); }
  });

  it("rejects an oversized rebuilt file even when the encoder reports success", async () => {
    const oversized = new EventEmitter() as ReturnType<typeof spawn>;
    Object.assign(oversized, { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true) });
    spawnMock.mockImplementation((...args: Parameters<typeof spawn>) => {
      if (!args[1]?.includes("-xerror")) return actualSpawn(...args);
      truncateSync(args[1]!.at(-1)!, MEDIA_POLICY["image/jpeg"].maxBytes + 1);
      queueMicrotask(() => { oversized.stdout!.emit("data", Buffer.from("frame=1\nprogress=end\n")); oversized.emit("close", 0); });
      return oversized;
    });
    try {
      await expect(stripMediaMetadata(validMediaFixture("image/jpeg"), "image/jpeg")).rejects.toMatchObject({ reason: "resource_limit" });
      for (const [, , options] of spawnMock.mock.calls) expect(existsSync(String(options?.cwd))).toBe(false);
    } finally { spawnMock.mockImplementation(actualSpawn); }
  });

  it("rejects recovered decoder errors even with a zero exit code", async () => {
    const recovered = new EventEmitter() as ReturnType<typeof spawn>;
    Object.assign(recovered, { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true) });
    spawnMock.mockImplementation((...args: Parameters<typeof spawn>) => {
      if (!args[1]?.includes("-show_entries")) return actualSpawn(...args);
      queueMicrotask(() => { recovered.stderr!.emit("data", Buffer.from(PRIVATE_METADATA_MARKER)); recovered.emit("close", 0); });
      return recovered;
    });
    try {
      const error = await stripMediaMetadata(validMediaFixture("image/jpeg"), "image/jpeg").catch((error: unknown) => error);
      expect(error).toMatchObject({ reason: "invalid_media" });
      expect(String(error)).not.toContain(PRIVATE_METADATA_MARKER);
    } finally { spawnMock.mockImplementation(actualSpawn); }
  });
});
