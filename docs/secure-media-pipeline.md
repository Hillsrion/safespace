# Secure media pipeline

The implementation is exposed through two authenticated resource routes and is
integrated into the report form and evidence viewers.

## Route contract

The existing `RESOURCES_API_PREFIX` block in `app/routes.ts` registers:

```ts
route(`media/upload`, routePath("api/media/upload.ts")),
route(`media/:mediaId`, routePath("api/media/:mediaId.ts")),
```

This produces the following same-origin endpoints:

- `POST /resources/api/media/upload`
- `GET /resources/api/media/:mediaId`
- `DELETE /resources/api/media/:mediaId`

All mutations require the existing same-origin/CSRF check and an authenticated,
currently active membership. Cross-space IDs, admin-only media, and hidden-post
media deliberately return the same `404` as an unknown media ID when the viewer
is not allowed to know they exist.

## Upload request and response

The upload endpoint accepts exactly one `multipart/form-data` file and two text
fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `file` | file | One supported image, audio, or video |
| `spaceId` | UUID string | Space scope used as an anti-IDOR guard |
| `postId` | UUID string | Existing post to which evidence is attached |

Example response (`201`):

```json
{
  "mediaId": "uuid",
  "url": "/resources/api/media/uuid",
  "mimeType": "image/jpeg",
  "fileSize": 123456,
  "originalFileSize": 124999,
  "metadataStripped": true,
  "metadataRemoved": true,
  "removedMetadataKinds": ["EXIF/XMP"]
}
```

The current relational schema requires a post before a `Media` row can exist,
so this contract uploads after report creation. A future draft-upload flow should
introduce an explicit expiring draft owner instead of nullable/unowned media.

Accepted formats and per-file limits are JPEG/PNG/WebP/GIF (15 MiB), MP3/WAV
(30 MiB), and MP4/QuickTime (100 MiB). A post is capped at 10 files and 250 MiB.
The request body is bounded even for chunked transfer, the declared MIME must
match an allowlisted signature/brand, and each accepted container must contain
real decodable media. A signature alone is never a successful validation.

## Content validation and metadata guarantee

`stripMediaMetadata(bytes, mimeType)` is asynchronous. Its caller must `await` it
before writing any object. It preserves the input MIME and extension, but returns
a **new encoding**, not a byte-preserved original:

1. Enforce compressed size/MIME and strict container structure.
2. Probe the input with an allowlisted demuxer and codecs. Require exactly one
   image/video stream or one audio stream; videos may also have one audio stream.
3. Fully decode and re-encode with FFmpeg, discarding input tags, chapters,
   attachments, subtitles/data tracks and frame side-data. H.264 SEI is removed.
4. Strip non-rendering metadata from the new container, validate it again, and
   decode/count its frames with ffprobe. Require complete frames and consistent
   dimensions/duration. Recheck the MIME and the output byte limit.

No failure path returns original bytes, a truncated success, or
`metadataStripped: true`. In particular, ffprobe alone or a decoder's successful
exit status with error diagnostics is insufficient. The process boundary does
not include filenames, metadata values, decoder stdout/stderr or host paths in
errors/logs. [FFmpeg's documentation](https://ffmpeg.org/ffmpeg.html#Transcoding)
distinguishes re-encoding from stream-copying, which would retain compressed
payloads and their embedded metadata.

The local structural gate deliberately accepts a narrower subset than every
variant of each file extension:

| Format | Required checks and accepted representation |
| --- | --- |
| JPEG | 8-bit baseline/progressive SOF, dimensions/components, DQT/DHT, valid scan headers, nonempty entropy data, final EOI with no trailing bytes; all scans must decode. APP/comment metadata is removed. |
| PNG | Single 13-byte IHDR, valid dimensions/color/depth, CRCs, ordered/consecutive IDAT, palette/transparency constraints, final empty IEND; bounded full zlib inflation with exact scanline lengths/filter bytes, including Adam7; unknown critical chunks rejected. Only rendering chunks survive. APNG is rejected. |
| GIF | Positive logical/frame dimensions, complete palettes, frame bounds, valid graphics controls, complete LZW dictionaries/pixel counts/end codes, trailer; at least one frame. All animation frames and loop count are retained. Other application/comment metadata is discarded. |
| WebP | Exact RIFF size and padding, valid VP8/VP8L dimensions/headers, matching VP8X/alpha/metadata flags and chunk order, exactly one complete decoded image. ICC/EXIF/XMP/unknown ancillary chunks are removed. Animated WebP is rejected. |
| MP3 | ID3/APE bounds, complete consecutive MPEG Layer III frames including side-information/payload sizes, consistent version/rate/channels, at least two frames; full audio decode. Layer I/II/free-bitrate streams and arbitrary tails are rejected. |
| WAV | Exact RIFF chunk bounds, one valid PCM/IEEE-float fmt (including supported extensible headers), matching channels/rate/byte rate/block alignment, nonempty whole samples and duration; metadata/unknown chunks discarded. Compressed WAV codecs are rejected. |
| MP4/MOV | Allowlisted ftyp brand, one moov with movie/track/media headers, one video and optionally one audio track, codec descriptions, complete stts/stsz/stsc/stco/co64 indexes, sample offsets within embedded mdat, no overlaps or external drefs. Fragmented/encrypted files are rejected. H.264/H.265/MPEG-4 video and supported AAC/MP3/PCM audio must fully decode. |

`metadataStripped: true` means this reconstruction and output verification
succeeded. `metadataRemoved` and `removedMetadataKinds` report recognized input
metadata that was actually discarded; `false` does **not** certify that the
original had no other hidden data. They never contain tag values. A clean file
can be rebuilt with `metadataRemoved: false`.

This is not content anonymization, a malware-free proof, a provenance/original
authenticity guarantee, or a steganography detector. Faces, names printed in an
image, voices, spoken locations and data hidden in pixels/audio can remain.
The service's SHA-256 identifies the rebuilt stored representation, not the
original upload. Metadata cleanup does not conceal a user's original display
filename from people entitled to see the evidence.

Reconstruction has a fidelity cost: JPEG/MP3/H.264/AAC are re-encoded; PNG is
normalized to 8-bit RGBA, WAV to 16-bit PCM, and GIF is re-palettized. WebP uses
lossless encoding of decoded pixels. Video is H.264/AAC in the original MP4 or
MOV container; odd dimensions are padded by one pixel for 4:2:0 encoding.
Color profiles/HDR/extra tracks are not preserved. Keep this limitation visible
when deciding whether an evidence workflow requires a separately controlled
original-file archive; the application currently stores only the privacy-cleaned
representation.

## Required decoder runtime and safety limits

FFmpeg and ffprobe are **mandatory system dependencies**; no npm decoder
package is downloaded at runtime. Major version 7 or newer and encoders
`mjpeg`, `png`, `gif`, `libwebp`, `libmp3lame`, `pcm_s16le`, `libx264`, `aac`
are checked on first use. The tested local build is FFmpeg/ffprobe **7.1.1**;
that is a test record, not a claim that this old build contains all current
security patches. Deploy a maintained patched distribution build and rerun the
codec tests when updating it.

| Variable | Default | Constraint |
| --- | --- | --- |
| `MEDIA_FFMPEG_PATH` | `ffmpeg` from the trusted runtime PATH | An override must be an absolute executable path, not a command line. |
| `MEDIA_FFPROBE_PATH` | `ffprobe` from the trusted runtime PATH | Same constraint. |
| `MEDIA_PROCESSING_TIMEOUT_MS` | `30000` | 1000–120000 ms, shared wall deadline for a job's subprocesses. |
| `MEDIA_PROCESSING_MAX_CONCURRENT` | `2` | 1–4 jobs per web process; no unbounded queue. |

Fixed limits in `media-processing-policy.server.ts` add:

- Images: at most 8192 per dimension and 24 million pixels. PNG inflated
  scanlines are additionally capped at 192 MiB.
- GIF: at most 300 frames, 240 million cumulative canvas pixels and 120 seconds
  per cycle. Infinite loop metadata never causes infinite decoding.
- Video: at most 4096 per dimension, 8,847,360 pixels, 18,000 frames, 60 average
  frames/second and 600 seconds (with one second of codec/container rounding
  tolerance).
- Audio: at most two channels, 8–96 kHz and 900 seconds (video audio stays
  within the video duration limit). Container/sample entry counts are bounded.
- Output: the same compressed-byte cap as input; it is rejected if rebuilding
  exceeds that cap. It is not silently reduced to its first frame or first N
  seconds.
- One codec/filter thread, 256 MiB maximum **single** FFmpeg allocation,
  1,048,576 samples per decode call, and 256 KiB process diagnostics/progress.
  Wall timeout, CPU time limit, output-file size and decoded frame/time progress
  are monitored; a limit violation kills the process and rejects the upload.

Each job gets a random temporary directory (0700), fixed generated filenames
and files (0600), removed in `finally` on success and ordinary failure. Only that
job's newly created directory is eligible for deletion. A host crash/SIGKILL can
leave private temporary files: use a disposable bounded tmpfs or host tmp-file
retention policy; this is not secure erasure of disk blocks.

Processes run without a shell and receive only PATH/locale/color-control
environment variables, never database/R2/session credentials. Input demuxers
and codecs are allowlisted; protocols are limited to local `file` and `pipe`,
and MOV external data references and absolute-path aliases are disabled and
rejected structurally. Input URLs, user-specified paths, filters and options are
never accepted. See the [FFmpeg protocol allowlist](https://ffmpeg.org/ffmpeg-protocols.html#Protocol-Options).

These are application-level bounds, **not an OS sandbox or a total RSS cap**.
`-max_alloc` bounds one allocation; multiple frames/buffers and Node's multipart
buffers still consume memory. Production needs non-root execution, bounded
CPU/RAM/pids/temporary storage, current codec patches and load tests; use a
separate network-denied media worker for stronger decoder isolation. Tune
concurrency conservatively for the available memory. No production load or
kernel-sandbox validation is implied by the unit tests.

Coolify/container deployments must install the above codec libraries in their
runtime image, not only the build stage. A standard Netlify deployment is not
assumed to supply those binaries, writable temporary storage, or a sufficient
execution timeout. Bundle and verify a compatible supported runtime or move
processing to an isolated worker before enabling uploads there. Missing or
unsupported binaries fail closed as `processor_unavailable` (HTTP 503 at the
service boundary); invalid media or an exhausted safety limit is rejected.
There is no signature-only serverless fallback.

## Decoder regression tests and fixture provenance

Run on the same FFmpeg build as production:

```sh
ffmpeg -version
ffprobe -version
npm run typecheck
npm test -- --run app/lib/media/metadata-stripper.server.test.ts app/lib/media/media-policy.server.test.ts app/services/media.server.test.ts
```

`fixtures.server.test-support.ts` holds base64 copies of actual encoded media,
not claimed file signatures. Fixtures were generated with local FFmpeg 7.1.1
using `-map_metadata -1 -fflags +bitexact -flags +bitexact`:

- JPEG/PNG/WebP: `lavfi color=c=red:s=16x16`, one frame, respectively MJPEG
  yuvj444p quality 2, PNG RGBA, and libwebp lossless.
- GIF: `lavfi testsrc=size=16x16:rate=10`, two frames, GIF with `-gifflags 0
  -loop -1`; a 64×64 looping variant exercises LZW code-width changes.
- MP3: `lavfi sine=frequency=440:sample_rate=44100:duration=0.12`,
  libmp3lame 128 kbit/s, no Xing/ID3 header. WAV: 8 kHz 0.05 seconds, pcm_s16le.
- MP4/MOV: `lavfi color=c=blue:s=16x16:r=10:d=0.2`, libx264 yuv420p,
  `-movflags +faststart`; variants add a 48 kHz, 0.2-second sine wave encoded
  as AAC 64 kbit/s. Another WebP uses lossy VP8 over a 16×16 test pattern.

The tests really invoke FFmpeg/ffprobe for all eight MIME types and the codec
variants; missing binaries do not skip these tests. Valid metadata fixtures add
a synthetic sentinel in a real TIFF/EXIF directory, PNG text, GIF comment,
ID3 title, WAV INFO or MP4 UUID box, and verify its physical absence afterward.
The seven original signature-only reproductions, corrupt compressed codec
payloads, malformed chunk/sample tables, dimensions bombs, external references,
unsupported variants, private-file cleanup and process failure/timeout limits
are separate regressions. Small-fixture success does not establish support for
every camera/codec profile or production-scale performance.

## Private delivery

`GET /resources/api/media/:mediaId` revalidates membership and post visibility,
then proxies a SigV4-authenticated R2 request. It supports one HTTP byte range for
video/audio seeking and returns `Cache-Control: private, no-store`. The browser
never sees an R2 key, bucket URL, access key, or reusable signed URL. The storage
adapter can also mint a short-lived (maximum five-minute) presigned URL for a
future edge-delivery mode.

Required deployment variables:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_ENDPOINT` (optional HTTPS override)
- `R2_SIGNED_URL_TTL_SECONDS` (optional, 1–300; default 45)

The R2 bucket must remain private; no public/custom-domain binding is required.

## Coordinated deletion and retry

SQL deletion first records each storage key in `MediaDeletionJob` in the same
transaction. R2 deletion is attempted immediately after commit. A provider
failure leaves the private object unreachable through the application and keeps
the durable job for retry. A scheduled worker may call:

```ts
const systemClient = createSystemPrismaClient();
await processPendingMediaDeletionJobs({ client: systemClient, limit: 25 });
await systemClient.$disconnect();
```

from a dedicated maintenance process using
`app/db/system-client.server.ts` and `app/services/media-deletion.server.ts`.
The privileged URL must never be available to the web process. Object deletion
is idempotent.
