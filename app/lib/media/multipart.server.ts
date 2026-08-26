import { MEDIA_MAX_REQUEST_BYTES, MediaValidationError } from "./media-policy.server";

export type MediaUploadForm = {
  file: File;
  postId: string;
  spaceId: string;
};

function parseContentLength(request: Request): number | null {
  const value = request.headers.get("Content-Length");
  if (!value) return null;
  if (!/^\d+$/.test(value)) {
    throw new MediaValidationError("Invalid Content-Length header", "malformed_file");
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw new MediaValidationError("Invalid Content-Length header", "malformed_file");
  }
  return length;
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = parseContentLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new MediaValidationError("The multipart upload is too large", "file_too_large");
  }
  if (!request.body) {
    throw new MediaValidationError("A multipart body is required", "empty_file");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("multipart body limit exceeded");
        throw new MediaValidationError("The multipart upload is too large", "file_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function isFile(value: FormDataEntryValue | null): value is File {
  return (
    value !== null &&
    typeof value !== "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.arrayBuffer === "function"
  );
}

/**
 * `Request.formData()` buffers without a size ceiling. Reading through this
 * bounded wrapper first prevents chunked requests from bypassing Content-Length.
 */
export async function parseMediaUploadForm(
  request: Request,
  maxBytes = MEDIA_MAX_REQUEST_BYTES
): Promise<MediaUploadForm> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!/^multipart\/form-data(?:\s*;|$)/i.test(contentType) || !/boundary=/i.test(contentType)) {
    throw new MediaValidationError(
      "Content-Type must be multipart/form-data with a boundary",
      "malformed_file"
    );
  }

  const bytes = await readBoundedBody(request, maxBytes);
  let form: FormData;
  try {
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    }).formData();
  } catch {
    throw new MediaValidationError("Malformed multipart upload", "malformed_file");
  }

  const acceptedFields = new Set(["file", "postId", "spaceId"]);
  for (const field of form.keys()) {
    if (!acceptedFields.has(field)) {
      throw new MediaValidationError(`Unexpected multipart field: ${field}`, "malformed_file");
    }
  }
  const files = form.getAll("file");
  const file = files[0] ?? null;
  if (files.length !== 1 || !isFile(file)) {
    throw new MediaValidationError("Exactly one file field is required", "malformed_file");
  }
  const postId = form.get("postId");
  const spaceId = form.get("spaceId");
  if (typeof postId !== "string" || typeof spaceId !== "string") {
    throw new MediaValidationError("postId and spaceId are required", "malformed_file");
  }

  return { file, postId: postId.trim(), spaceId: spaceId.trim() };
}
