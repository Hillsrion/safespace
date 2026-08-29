import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { HttpError, errors } from "~/lib/api/http-error";
import { errorResponse } from "~/lib/api/response";
import { requireSameOrigin } from "~/lib/security.server";
import {
  MediaStorageConfigurationError,
  MediaStorageError,
} from "~/services/media-storage.server";
import { deleteMedia, getAuthorizedMediaObject, getAuthorizedWatermarkedMediaObject, updateMediaEvidence } from "~/services/media.server";
import { updateEvidenceSchema } from "~/lib/evidence";
import { requireUser } from "~/services/auth.server";
import { captureServerException } from "~/services/observability.server";

const mediaIdSchema = z.string().uuid("Invalid media ID");
const singleByteRangePattern = /^bytes=(?:\d+-\d*|-\d+)$/;

function mediaIdFrom(params: Record<string, string | undefined>): string {
  const parsed = mediaIdSchema.safeParse(params.mediaId);
  if (!parsed.success) throw errors.badRequest("Invalid media ID");
  return parsed.data;
}
async function storageFailure(
  error: MediaStorageError | MediaStorageConfigurationError,
  operation: "media.delete" | "media.download" | "media.update"
): Promise<Response> {
  await captureServerException(error, {
    operation,
    outcome: "failure",
    errorCode: "server_error:api",
    httpStatus: error instanceof MediaStorageError && error.status === 416 ? 416 : 503,
    storageProvider: "r2",
  });
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
      response.headers.set("Allow", "GET, PATCH, DELETE");
      return response;
    }
    const actor = await requireUser(request);
    const mediaId = mediaIdFrom(params);
    const url = new URL(request.url);
    const watermarkValue = url.searchParams.get("watermark");
    if (watermarkValue !== null && watermarkValue !== "1") {
      throw errors.badRequest("Invalid watermark option");
    }
    const watermark = watermarkValue === "1";
    const range = request.headers.get("Range") ?? undefined;
    if (range && (!singleByteRangePattern.test(range) || range.includes(","))) {
      throw errors.badRequest("Only one valid byte range may be requested");
    }
    if (watermark && range) throw errors.badRequest("Watermarked media does not support byte ranges");

    const media = watermark
      ? await getAuthorizedWatermarkedMediaObject(actor, mediaId)
      : await getAuthorizedMediaObject(actor, mediaId, { range });
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition": media.contentDisposition,
      "Content-Type": media.mimeType,
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    if (!("watermark" in media)) headers.set("Accept-Ranges", "bytes");
    if (media.contentLength !== null) headers.set("Content-Length", String(media.contentLength));
    if (media.contentRange) headers.set("Content-Range", media.contentRange);
    if ("watermark" in media) headers.set("X-SafeSpace-Watermark", media.watermark);
    return new Response(media.body, { status: media.status, headers });
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    if (error instanceof MediaStorageError || error instanceof MediaStorageConfigurationError) {
      return storageFailure(error, "media.download");
    }
    await captureServerException(error, {
      operation: "media.download",
      outcome: "failure",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
    console.error("Unexpected private media download failure", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse("Media download failed", "server_error:api", 500);
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const operation = request.method.toUpperCase() === "PATCH" ? "media.update" : "media.delete";
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() === "PATCH") {
      const actor = await requireUser(request);
      let payload: unknown;
      try { payload = await request.json(); } catch { throw errors.badRequest("Invalid JSON body"); }
      const body = updateEvidenceSchema.safeParse(payload);
      if (!body.success) throw errors.badRequest("Invalid evidence metadata");
      const result = await updateMediaEvidence(actor, mediaIdFrom(params), body.data);
      const response = Response.json({ success: true, ...result }); response.headers.set("Cache-Control", "private, no-store"); return response;
    }
    if (request.method.toUpperCase() !== "DELETE") {
      const response = errorResponse("Method not allowed", "bad_request:api", 405);
      response.headers.set("Allow", "GET, PATCH, DELETE");
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
      return storageFailure(error, operation);
    }
    await captureServerException(error, {
      operation,
      outcome: "failure",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
    console.error("Unexpected private media mutation failure", {
      operation,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse(operation === "media.update" ? "Media update failed" : "Media deletion failed", "server_error:api", 500);
  }
}
