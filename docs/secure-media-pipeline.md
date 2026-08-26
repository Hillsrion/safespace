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
match magic bytes, and each accepted container is structurally parsed while
privacy metadata is removed.

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
