import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { HttpError, errors } from "~/lib/api/http-error";
import { errorResponse } from "~/lib/api/response";
import { requireSameOrigin } from "~/lib/security.server";
import {
  MediaStorageConfigurationError,
  MediaStorageError,
} from "~/services/media-storage.server";
import { deleteMedia, getAuthorizedMediaObject } from "~/services/media.server";
import { requireUser } from "~/services/auth.server";

const mediaIdSchema = z.string().uuid("Invalid media ID");
const singleByteRangePattern = /^bytes=(?:\d+-\d*|-\d+)$/;

function mediaIdFrom(params: Record<string, string | undefined>): string {
  const parsed = mediaIdSchema.safeParse(params.mediaId);
  if (!parsed.success) throw errors.badRequest("Invalid media ID");
  return parsed.data;
}
function storageFailure(error: MediaStorageError | MediaStorageConfigurationError): Response {
  console.error("Private media storage failure", {
    errorType: error.name,
    status: error instanceof MediaStorageError ? error.status : undefined,
  });
  if (error instanceof MediaStorageError && error.status === 416) {
    return errorResponse("Requested media range is not satisfiable", "bad_request:api", 416);
  }
  return errorResponse("Media storage is temporarily unavailable", "server_error:api", 503);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    if (request.method.toUpperCase() !== "GET") {
      const response = errorResponse("Method not allowed", "bad_request:api", 405);
      response.headers.set("Allow", "GET, DELETE");
      return response;
    }
    const actor = await requireUser(request);
    const mediaId = mediaIdFrom(params);
    const range = request.headers.get("Range") ?? undefined;
    if (range && (!singleByteRangePattern.test(range) || range.includes(","))) {
      throw errors.badRequest("Only one valid byte range may be requested");
    }

    const media = await getAuthorizedMediaObject(actor, mediaId, { range });
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Disposition": media.contentDisposition,
      "Content-Type": media.mimeType,
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    if (media.contentLength !== null) headers.set("Content-Length", String(media.contentLength));
    if (media.contentRange) headers.set("Content-Range", media.contentRange);
    return new Response(media.body, { status: media.status, headers });
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    if (error instanceof MediaStorageError || error instanceof MediaStorageConfigurationError) {
      return storageFailure(error);
    }
    console.error("Unexpected private media download failure", error);
    return errorResponse("Media download failed", "server_error:api", 500);
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "DELETE") {
      const response = errorResponse("Method not allowed", "bad_request:api", 405);
      response.headers.set("Allow", "GET, DELETE");
      return response;
    }
    const actor = await requireUser(request);
    const result = await deleteMedia(actor, mediaIdFrom(params));
    const response = Response.json({ success: true, ...result });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    if (error instanceof MediaStorageError || error instanceof MediaStorageConfigurationError) {
      return storageFailure(error);
    }
    console.error("Unexpected private media deletion failure", error);
    return errorResponse("Media deletion failed", "server_error:api", 500);
  }
}
