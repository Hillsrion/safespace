import type { LoaderFunctionArgs } from "react-router";

import { errors, HttpError } from "~/lib/api/http-error";
import { errorResponse } from "~/lib/api/response";
import { logServerException } from "~/lib/error/server-error.server";
import { publicMessageForStatus } from "~/lib/error/public";
import {
  spaceMemberListParamsSchema,
  spaceMemberListQuerySchema,
} from "~/lib/space-member-list";
import { getCurrentUser } from "~/services/auth.server";
import {
  listSpaceMembers,
  SpaceMemberListError,
} from "~/services/space-member-list.server";

function methodNotAllowed(): Response {
  const response = errorResponse("Method not allowed", "bad_request:api", 405);
  response.headers.set("Allow", "GET");
  return response;
}

function parseUniqueQuery(request: Request): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(values, key)) {
      throw errors.badRequest("Duplicate member list query parameter");
    }
    values[key] = value;
  }
  return values;
}

function boundaryError(error: unknown): Response {
  if (error instanceof HttpError) return error.toResponse();
  if (error instanceof SpaceMemberListError) {
    return errorResponse(
      publicMessageForStatus(error.status),
      error.status === 403 ? "forbidden:auth" : "not_found:api",
      error.status
    );
  }
  logServerException(error, {
    operation: "database.query",
    errorCode: "server_error:api",
    httpStatus: 500,
  });
  return errorResponse("Unable to list space members", "server_error:api", 500);
}

export async function listSpaceMembersLoader({
  request,
  params,
}: LoaderFunctionArgs): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "GET") return methodNotAllowed();

    const actor = await getCurrentUser(request);
    if (!actor) throw errors.unauthorized("Authentication required");

    const parsedParams = spaceMemberListParamsSchema.safeParse(params);
    if (!parsedParams.success) throw errors.badRequest("Invalid member list path");

    const parsedQuery = spaceMemberListQuerySchema.safeParse(parseUniqueQuery(request));
    if (!parsedQuery.success) {
      throw errors.badRequest(
        "Invalid member list query",
        "bad_request:api",
        parsedQuery.error.flatten()
      );
    }

    return Response.json(
      {
        success: true,
        ...(await listSpaceMembers(actor, parsedParams.data.spaceId, parsedQuery.data)),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return boundaryError(error);
  }
}
