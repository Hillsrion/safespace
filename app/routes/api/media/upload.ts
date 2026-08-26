import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { HttpError, errors } from "~/lib/api/http-error";
import { errorResponse } from "~/lib/api/response";
import { parseMediaUploadForm } from "~/lib/media/multipart.server";
import { MediaValidationError } from "~/lib/media/media-policy.server";
import { requireSameOrigin } from "~/lib/security.server";
import {
  MediaStorageConfigurationError,
  MediaStorageError,
} from "~/services/media-storage.server";
import { uploadMedia } from "~/services/media.server";
import { requireUser } from "~/services/auth.server";

const uuidSchema = z.string().uuid();

export async function action({ request }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "POST") {
      const response = errorResponse("Method not allowed", "bad_request:api", 405);
      response.headers.set("Allow", "POST");
      return response;
    }

    const actor = await requireUser(request);
    let form;
    try {
      form = await parseMediaUploadForm(request);
    } catch (error) {
      if (error instanceof MediaValidationError) {
        throw errors.badRequest(error.message, "bad_request:api", { reason: error.reason });
      }
      throw error;
    }
    if (!uuidSchema.safeParse(form.spaceId).success || !uuidSchema.safeParse(form.postId).success) {
      throw errors.badRequest("spaceId and postId must be valid UUIDs");
    }

    const bytes = new Uint8Array(await form.file.arrayBuffer());
    const response = Response.json(
      await uploadMedia(actor, {
        bytes,
        declaredMimeType: form.file.type,
        fileName: form.file.name,
        postId: form.postId,
        spaceId: form.spaceId,
      }),
      { status: 201 }
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    if (error instanceof MediaStorageError || error instanceof MediaStorageConfigurationError) {
      console.error("Private media upload storage failure", {
        errorType: error.name,
        status: error instanceof MediaStorageError ? error.status : undefined,
      });
      return errorResponse("Media storage is temporarily unavailable", "server_error:api", 503);
    }
    console.error("Unexpected private media upload failure", error);
    return errorResponse("Media upload failed", "server_error:api", 500);
  }
}
