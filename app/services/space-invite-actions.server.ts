import type { ActionFunctionArgs } from "react-router";

import { errors, HttpError } from "~/lib/api/http-error";
import { errorResponse } from "~/lib/api/response";
import { logServerException } from "~/lib/error/server-error.server";
import { publicMessageForStatus } from "~/lib/error/public";
import { requireSameOrigin } from "~/lib/security.server";
import {
  spaceInviteBodySchema,
  spaceInviteParamsSchema,
} from "~/lib/space-invite";
import { getCurrentUser } from "~/services/auth.server";
import { createSpaceInvite, SpaceInviteError } from "~/services/space-invite.server";

export function resolveInviteOrigin(request: Request): string {
  const configuredOrigin = process.env.APP_URL?.trim();
  if (!configuredOrigin) {
    if (process.env.NODE_ENV === "production" && process.env.RESEND_API_KEY) {
      throw new Error("APP_URL is required when invitation email is enabled");
    }
    return new URL(request.url).origin;
  }

  const url = new URL(configuredOrigin);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("APP_URL must use http or https");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("APP_URL must use https in production");
  }
  return url.origin;
}

function methodNotAllowed(): Response {
  const response = errorResponse("Method not allowed", "bad_request:api", 405);
  response.headers.set("Allow", "POST");
  return response;
}

function boundaryError(error: unknown): Response {
  if (error instanceof HttpError) return error.toResponse();
  if (error instanceof SpaceInviteError) {
    return errorResponse(
      publicMessageForStatus(error.status),
      error.status === 403
        ? "forbidden:auth"
        : error.status === 404
          ? "not_found:api"
          : "conflict:api",
      error.status
    );
  }
  logServerException(error, {
    operation: "space.mutate",
    errorCode: "server_error:api",
    httpStatus: 500,
  });
  return errorResponse("Unable to create invitation", "server_error:api", 500);
}

export async function createSpaceInviteAction({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "POST") return methodNotAllowed();
    requireSameOrigin(request);

    const actor = await getCurrentUser(request);
    if (!actor) throw errors.unauthorized("Authentication required");

    const parsedParams = spaceInviteParamsSchema.safeParse(params);
    if (!parsedParams.success) throw errors.badRequest("Invalid invitation path");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw errors.badRequest("A valid JSON body is required");
    }
    const parsedBody = spaceInviteBodySchema.safeParse(body);
    if (!parsedBody.success) {
      throw errors.badRequest(
        "Invalid invitation",
        "bad_request:api",
        parsedBody.error.flatten()
      );
    }

    const invite = await createSpaceInvite(
      actor,
      parsedParams.data.spaceId,
      parsedBody.data,
      resolveInviteOrigin(request)
    );
    return Response.json(
      { success: true, invite },
      { status: 201, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return boundaryError(error);
  }
}
