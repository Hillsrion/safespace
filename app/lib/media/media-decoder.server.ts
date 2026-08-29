import childProcess from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { MEDIA_POLICY, type SupportedMediaMimeType } from "./media-policy.server";
import { MediaProcessingError } from "./media-processing-error.server";
import { checkDimensions, MEDIA_PROCESSING_LIMITS as LIMITS } from "./media-processing-policy.server";
import { inspectMediaStructure, type StructuredMedia } from "./media-structure.server";

type Configuration = { ffmpeg: string; ffprobe: string; watermarkFont: string; timeoutMs: number; concurrent: number };
type ProbeStream = {
  codec_name?: string; codec_type?: string; width?: number; height?: number;
  sample_rate?: string; channels?: number; duration?: string; nb_frames?: string;
  nb_read_frames?: string; avg_frame_rate?: string;
};
type Probe = { streams: ProbeStream[]; format?: { duration?: string } };
let activeJobs = 0;
const checkedBinaries = new Map<string, Promise<void>>();

function configuration(): Configuration {
  function binary(variable: string, fallback: string): string {
    const configured = process.env[variable];
    if (configured !== undefined && (!isAbsolute(configured) || configured.includes("\0"))) {
      throw new MediaProcessingError("Media processor configuration is invalid", "processor_unavailable");
    }
    return configured ?? fallback;
  }
  function integer(variable: string, fallback: number, min: number, max: number): number {
    const raw = process.env[variable];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < min || value > max) {
      throw new MediaProcessingError("Media processor limits are invalid", "processor_unavailable");
    }
    return value;
  }
  const watermarkFont = binary(
    "MEDIA_WATERMARK_FONT_PATH",
    existsSync("/System/Library/Fonts/Supplemental/Arial.ttf")
      ? "/System/Library/Fonts/Supplemental/Arial.ttf"
      : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
  );
  // This path is embedded in an FFmpeg filter expression, unlike executable
  // paths which are passed as spawn arguments. Keep its grammar deliberately
  // narrower so environment configuration cannot inject another filter.
  if (!/^[A-Za-z0-9_./ -]+$/.test(watermarkFont)) {
    throw new MediaProcessingError("Watermark font configuration is invalid", "processor_unavailable");
  }
  return {
    ffmpeg: binary("MEDIA_FFMPEG_PATH", "ffmpeg"),
    ffprobe: binary("MEDIA_FFPROBE_PATH", "ffprobe"),
    watermarkFont,
    timeoutMs: integer("MEDIA_PROCESSING_TIMEOUT_MS", 30_000, 1000, 120_000),
    concurrent: integer("MEDIA_PROCESSING_MAX_CONCURRENT", 2, 1, 4),
  };
}

/** Never runs a shell, inherits secrets, or returns decoder diagnostics. */
function run(
  binary: string,
  args: string[],
  options: { cwd: string; deadline: number; progress?: { frames: number; seconds: number }; outputPath?: string; maxOutputBytes?: number }
): Promise<string> {
  const remaining = options.deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new MediaProcessingError("Media processing timed out", "resource_limit"));
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(binary, args, {
      shell: false, windowsHide: true, cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH, LANG: "C", LC_ALL: "C", AV_LOG_FORCE_NOCOLOR: "1" },
    });
    let stdout = "", stderrBytes = 0, stdoutBytes = 0, settled = false;
    let failure: MediaProcessingError | undefined;
    const stop = (error: MediaProcessingError) => { failure ??= error; child.kill("SIGKILL"); };
    const timeout = setTimeout(() => stop(new MediaProcessingError("Media processing timed out", "resource_limit")), remaining);
    let checkingSize = false;
    const sizeTimer = options.outputPath ? setInterval(() => {
      if (checkingSize || settled) return;
      checkingSize = true;
      void stat(options.outputPath!).then((file) => {
        if (file.size > options.maxOutputBytes!) stop(new MediaProcessingError("Processed media exceeds its size limit", "resource_limit"));
      }).catch(() => { /* output is also checked after the process closes */ }).finally(() => { checkingSize = false; });
    }, 100) : undefined;
    child.stdout.on("data", (data: Buffer) => {
      stdoutBytes += data.length;
      if (stdoutBytes > LIMITS.diagnosticsBytes) { stop(new MediaProcessingError("Media processor output exceeds limits", "resource_limit")); return; }
      stdout += data.toString("utf8");
      if (options.progress) {
        for (const match of stdout.matchAll(/(?:^|\n)frame=\s*(\d+)\s*(?:\n|$)/g)) {
          if (Number(match[1]) > options.progress.frames) stop(new MediaProcessingError("Decoded frame count exceeds limits", "resource_limit"));
        }
        for (const match of stdout.matchAll(/(?:^|\n)out_time_us=(-?\d+)(?:\n|$)/g)) {
          if (Number(match[1]) > options.progress.seconds * 1_000_000) stop(new MediaProcessingError("Decoded duration exceeds limits", "resource_limit"));
        }
      }
    });
    child.stderr.on("data", (data: Buffer) => {
      stderrBytes += data.length;
      // We use loglevel=error. Even a decoder that recovers and exits 0 fails closed.
      if (stderrBytes > LIMITS.diagnosticsBytes) stop(new MediaProcessingError("Media decoder rejected the payload"));
    });
    child.on("error", () => { failure = new MediaProcessingError("Media processor is unavailable", "processor_unavailable"); });
    child.on("close", (code) => {
      settled = true; clearTimeout(timeout); if (sizeTimer) clearInterval(sizeTimer);
      if (failure) reject(failure);
      else if (code !== 0 || stderrBytes > 0) reject(new MediaProcessingError("Media decoder rejected the payload"));
      else resolve(stdout);
    });
  });
}

async function checkBinaries(config: Configuration, cwd: string, deadline: number): Promise<void> {
  const key = `${config.ffmpeg}\0${config.ffprobe}`;
  let checked = checkedBinaries.get(key);
  if (!checked) {
    checked = (async () => {
      try {
        for (const [binary, name] of [[config.ffmpeg, "ffmpeg"], [config.ffprobe, "ffprobe"]]) {
          const version = await run(binary, ["-hide_banner", "-version"], { cwd, deadline });
          const match = version.match(new RegExp(`^${name} version (?:n)?(\\d+)\\.`));
          if (!match || Number(match[1]) < 7) throw new Error("unsupported");
        }
        const encoders = await run(config.ffmpeg, ["-hide_banner", "-loglevel", "error", "-encoders"], { cwd, deadline });
        for (const encoder of ["mjpeg", "png", "gif", "libwebp", "libmp3lame", "pcm_s16le", "libx264", "aac"]) {
          if (!new RegExp(`\\s${encoder}\\s`).test(encoders)) throw new Error("unsupported");
        }
      } catch {
        throw new MediaProcessingError("A supported FFmpeg and ffprobe installation is required", "processor_unavailable");
      }
    })();
    checkedBinaries.set(key, checked);
    void checked.catch(() => { checkedBinaries.delete(key); });
  }
  await checked;
}

const FORMATS: Record<SupportedMediaMimeType, { demuxer: string; decoders: string }> = {
  "image/jpeg": { demuxer: "jpeg_pipe", decoders: "mjpeg" },
  "image/png": { demuxer: "png_pipe", decoders: "png" },
  "image/gif": { demuxer: "gif", decoders: "gif" },
  "image/webp": { demuxer: "webp_pipe", decoders: "webp" },
  "audio/mpeg": { demuxer: "mp3", decoders: "mp3,mp3float" },
  "audio/wav": { demuxer: "wav", decoders: "pcm_u8,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,pcm_f64le" },
  "video/mp4": { demuxer: "mov", decoders: "h264,hevc,mpeg4,aac,mp3,mp3float,pcm_s16le,pcm_s16be,pcm_s24le,pcm_s32le" },
  "video/quicktime": { demuxer: "mov", decoders: "h264,hevc,mpeg4,aac,mp3,mp3float,pcm_s16le,pcm_s16be,pcm_s24le,pcm_s32le" },
};

function inputArguments(mime: SupportedMediaMimeType, path: string): string[] {
  const { demuxer, decoders } = FORMATS[mime];
  return [
    "-max_alloc", String(LIMITS.allocationBytes),
    "-protocol_whitelist", "file,pipe", "-protocol_blacklist", "http,https,tcp,tls,udp,rtp,rtsp,ftp,crypto,concat,subfile,data",
    "-format_whitelist", demuxer, "-codec_whitelist", decoders,
    "-threads", "1", "-max_pixels", String(mime.startsWith("video/") ? LIMITS.videoPixels : LIMITS.imagePixels),
    "-max_samples", "1048576", "-err_detect", "crccheck+bitstream+buffer+explode",
    "-probesize", "5242880", "-analyzeduration", "5000000",
    ...(demuxer === "mov" ? ["-enable_drefs", "0", "-use_absolute_path", "0", "-ignore_chapters", "1"] : []),
    ...(demuxer === "gif" ? ["-ignore_loop", "1", "-min_delay", "2"] : []),
    "-f", demuxer, "-i", path,
  ];
}

function probeArguments(mime: SupportedMediaMimeType, path: string, countFrames: boolean): string[] {
  return [
    "-hide_banner", "-loglevel", "error", ...inputArguments(mime, path),
    ...(countFrames ? ["-count_frames"] : []), "-show_entries",
    "stream=codec_name,codec_type,width,height,sample_rate,channels,duration,nb_frames,nb_read_frames,avg_frame_rate:format=duration:stream_side_data=",
    "-of", "json",
  ];
}

function validateProbe(text: string, mime: SupportedMediaMimeType, structure: StructuredMedia, decoded: boolean): Probe {
  let probe: Probe;
  try { probe = JSON.parse(text) as Probe; } catch { throw new MediaProcessingError("Media probe produced an invalid response"); }
  if (!Array.isArray(probe.streams) || probe.streams.length < 1 || probe.streams.length > 2) throw new MediaProcessingError("Media has an unsupported stream count");
  const kind = MEDIA_POLICY[mime].kind;
  const video = probe.streams.filter((stream) => stream.codec_type === "video"), audio = probe.streams.filter((stream) => stream.codec_type === "audio");
  if (video.length + audio.length !== probe.streams.length || (kind === "audio" ? audio.length !== 1 || video.length !== 0 : video.length !== 1 || (kind === "image" && audio.length !== 0))) {
    throw new MediaProcessingError("Media streams do not match the declared type");
  }
  const codecNames = new Set(FORMATS[mime].decoders.split(","));
  for (const stream of probe.streams) {
    if (!stream.codec_name || !codecNames.has(stream.codec_name)) throw new MediaProcessingError("Media codec is not supported");
    if (stream.codec_type === "video") {
      checkDimensions(stream.width!, stream.height!, kind === "video");
      if (stream.width !== structure.width || stream.height !== structure.height) throw new MediaProcessingError("Container and codec dimensions disagree");
      const frames = Number(decoded ? stream.nb_read_frames : stream.nb_frames);
      if (decoded && (!Number.isInteger(frames) || frames < 1 || frames !== structure.frames)) throw new MediaProcessingError("Decoded frames do not match the container");
      if (!decoded && Number.isFinite(frames) && structure.frames !== frames) throw new MediaProcessingError("Media frame index is inconsistent");
    } else {
      const rate = Number(stream.sample_rate);
      if (!Number.isInteger(rate) || rate < 8000 || rate > LIMITS.sampleRate || !Number.isInteger(stream.channels) || stream.channels! < 1 || stream.channels! > LIMITS.channels) throw new MediaProcessingError("Audio parameters exceed processing limits", "resource_limit");
      if (decoded && !(Number(stream.nb_read_frames) > 0)) throw new MediaProcessingError("Media has no decoded audio samples");
    }
    if (stream.duration !== undefined && stream.duration !== "N/A") {
      const duration = Number(stream.duration), max = kind === "audio" ? LIMITS.audioSeconds : kind === "video" ? LIMITS.videoSeconds : LIMITS.animationSeconds;
      if (!Number.isFinite(duration) || duration <= 0 || duration > max + 1) throw new MediaProcessingError("Media duration exceeds processing limits", "resource_limit");
    }
  }
  return probe;
}

function watermarkFilter(fontPath: string): string {
  const escaped = fontPath.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
  return `drawtext=fontfile='${escaped}':text='SafeSpace - CONFIDENTIEL':fontcolor=white@0.38:fontsize=max(8\\,h/18):x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.24:boxborderw=max(2\\,h/60)`;
}

function encodingArguments(
  mime: SupportedMediaMimeType,
  source: StructuredMedia,
  watermarkFont?: string
): string[] {
  const kind = MEDIA_POLICY[mime].kind;
  const mark = watermarkFont ? watermarkFilter(watermarkFont) : undefined;
  const videoFilters = [
    "sidedata=mode=delete",
    ...(kind === "video" ? ["pad=ceil(iw/2)*2:ceil(ih/2)*2"] : []),
    ...(mark ? [mark] : []),
  ].join(",");
  const maps = mime === "image/gif" ? [
    "-filter_complex", `[0:v:0]sidedata=mode=delete${mark ? `,${mark}` : ""},split[v][p];[p]palettegen=stats_mode=single[pal];[v][pal]paletteuse=new=1[out]`, "-map", "[out]",
  ] : kind === "audio" ? ["-map", "0:a:0", "-af", "asidedata=mode=delete"] : [
    "-map", "0:v:0", "-vf", videoFilters,
    ...(kind === "video" ? ["-map", "0:a:0?", "-af", "asidedata=mode=delete"] : []),
  ];
  const common = [
    ...maps, "-map_metadata", "-1", "-map_metadata:s", "-1", "-map_chapters", "-1", "-sn", "-dn",
    "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
    "-metadata", "encoder=", "-metadata:s", "encoder=", "-threads", "1",
    ...(kind !== "audio" ? ["-fps_mode", "passthrough"] : []),
  ];
  const specific: Record<SupportedMediaMimeType, string[]> = {
    "image/jpeg": ["-c:v", "mjpeg", "-q:v", "2", "-pix_fmt", "yuvj444p", "-f", "image2pipe"],
    "image/png": ["-c:v", "png", "-pix_fmt", "rgba", "-pred", "mixed", "-f", "image2pipe"],
    "image/gif": ["-c:v", "gif", "-gifflags", "0", "-loop", String(source.animationLoop ?? -1), "-f", "gif"],
    "image/webp": ["-c:v", "libwebp", "-lossless", "1", "-pix_fmt", "bgra", "-compression_level", "4", "-f", "webp"],
    "audio/mpeg": ["-c:a", "libmp3lame", "-b:a", "192k", "-write_xing", "0", "-id3v2_version", "0", "-write_id3v1", "0", "-f", "mp3"],
    "audio/wav": ["-c:a", "pcm_s16le", "-write_bext", "0", "-f", "wav"],
    "video/mp4": [], "video/quicktime": [],
  };
  const video = [
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-bsf:v", "filter_units=remove_types=6",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart+disable_chpl", "-metadata:s:v:0", "rotate=0",
    "-f", mime === "video/quicktime" ? "mov" : "mp4",
  ];
  return [...common, ...(kind === "video" ? video : specific[mime])];
}

/** Fully decodes/re-encodes. No stream copy, metadata copy or partial success. */
async function processMedia(
  input: Uint8Array,
  mime: SupportedMediaMimeType,
  source: StructuredMedia,
  watermark: boolean
): Promise<StructuredMedia> {
  const config = configuration();
  if (activeJobs >= config.concurrent) throw new MediaProcessingError("Media processor is at capacity; retry later", "resource_limit");
  activeJobs++;
  let directory: string | undefined;
  const deadline = Date.now() + config.timeoutMs;
  try {
    directory = await mkdtemp(join(tmpdir(), "safespace-media-"));
    await chmod(directory, 0o700);
    const inputPath = join(directory, "input.bin"), outputPath = join(directory, "output.bin");
    await writeFile(inputPath, input, { mode: 0o600, flag: "wx" });
    await writeFile(outputPath, new Uint8Array(), { mode: 0o600, flag: "wx" });
    await checkBinaries(config, directory, deadline);
    const probe = await run(config.ffprobe, probeArguments(mime, inputPath, false), { cwd: directory, deadline });
    validateProbe(probe, mime, source, false);
    const kind = MEDIA_POLICY[mime].kind, maxBytes = MEDIA_POLICY[mime].maxBytes;
    const maxFrames = kind === "video" ? LIMITS.videoFrames : mime === "image/gif" ? LIMITS.animationFrames : kind === "image" ? 1 : 0;
    const maxSeconds = kind === "video" ? LIMITS.videoSeconds + 1 : kind === "audio" ? LIMITS.audioSeconds + 1 : LIMITS.animationSeconds + 1;
    const progress = await run(config.ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-nostats", "-y", "-xerror", "-filter_threads", "1", "-filter_complex_threads", "1",
      "-timelimit", String(Math.ceil(config.timeoutMs / 1000)), "-progress", "pipe:1", "-stats_period", "0.25",
      ...inputArguments(mime, inputPath), ...encodingArguments(mime, source, watermark ? config.watermarkFont : undefined),
      // -fs bounds disk; size and complete frame counts below forbid truncated success.
      "-fs", String(maxBytes + 1), outputPath,
    ], { cwd: directory, deadline, progress: { frames: maxFrames, seconds: maxSeconds }, outputPath, maxOutputBytes: maxBytes });
    if (!progress.includes("progress=end")) throw new MediaProcessingError("Media decoding did not finish");
    if (kind !== "audio") {
      const counts = [...progress.matchAll(/(?:^|\n)frame=\s*(\d+)\s*(?:\n|$)/g)];
      if (Number(counts.at(-1)?.[1]) !== source.frames) throw new MediaProcessingError("Media processing lost or added frames");
    }
    const outputStat = await stat(outputPath);
    if (outputStat.size < 1 || outputStat.size > maxBytes) throw new MediaProcessingError("Processed media exceeds its size limit", "resource_limit");
    const canonical = inspectMediaStructure(new Uint8Array(await readFile(outputPath)), mime);
    await writeFile(outputPath, canonical.bytes, { mode: 0o600 });
    const verified = await run(config.ffprobe, probeArguments(mime, outputPath, true), { cwd: directory, deadline });
    validateProbe(verified, mime, canonical, true);
    if (source.frames !== undefined && canonical.frames !== source.frames) throw new MediaProcessingError("Rebuilt media does not preserve its complete frame sequence");
    if (source.durationSeconds && canonical.durationSeconds && Math.abs(source.durationSeconds - canonical.durationSeconds) > (kind === "audio" ? 0.2 : 0.1)) throw new MediaProcessingError("Rebuilt media duration differs from its source");
    return canonical;
  } catch (error) {
    if (error instanceof MediaProcessingError) throw error;
    throw new MediaProcessingError("Media processing could not complete", "processor_unavailable");
  } finally {
    // Only this call's freshly created, private directory can be removed.
    try { if (directory) await rm(directory, { recursive: true, force: true }); }
    catch { throw new MediaProcessingError("Private media workspace cleanup failed", "processor_unavailable"); }
    finally { activeJobs--; }
  }
}

/** Fully decodes/re-encodes. No stream copy, metadata copy or partial success. */
export async function canonicalizeMedia(input: Uint8Array, mime: SupportedMediaMimeType, source: StructuredMedia): Promise<StructuredMedia> {
  return processMedia(input, mime, source, false);
}

/**
 * Produces a separate, visibly marked representation. The canonical evidence
 * passed by the caller is never mutated or replaced.
 */
export async function renderMediaWatermark(
  input: Uint8Array,
  mime: SupportedMediaMimeType
): Promise<StructuredMedia> {
  if (MEDIA_POLICY[mime].kind === "audio") {
    throw new MediaProcessingError("Audio evidence cannot receive a visual watermark", "resource_limit");
  }
  const source = inspectMediaStructure(input, mime);
  return processMedia(input, mime, source, true);
}
