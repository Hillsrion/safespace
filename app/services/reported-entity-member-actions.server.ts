import type { LoaderFunctionArgs } from "react-router";

import { HttpError, errors } from "~/lib/api/http-error";
import { errorResponse } from "~/lib/api/response";
import {
  reportedEntityMemberCollectionParamsSchema,
  reportedEntityMemberItemParamsSchema,
  reportedEntityMemberPageQuerySchema,
} from "~/lib/reported-entity-member";
import { logServerException } from "~/lib/error/server-error.server";
import { getCurrentUser } from "~/services/auth.server";
import {
  getReportedEntityForMember,
  listReportedEntitiesForMember,
} from "~/services/reported-entity-member.server";

function methodNotAllowed() {
  const response = errorResponse(
    "Method not allowed",
    "bad_request:api",
    405
  );
  response.headers.set("Allow", "GET");
  return response;
}

function memberReadError(error: unknown) {
  if (error instanceof HttpError) return error.toResponse();
  logServerException(error, {
    operation: "database.query",
    errorCode: "server_error:api",
    httpStatus: 500,
  });
  return errorResponse(
    "Unable to read reported entities",
    "server_error:api",
    500
  );
}

function parseUniqueQuery(request: Request) {
  const values: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(values, key)) {
      throw errors.badRequest("Duplicate reported entity query parameter");
    }
    values[key] = value;
  }
  return values;
}

async function requireMemberActor(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) throw errors.unauthorized("Authentication required");
  return user;
}

export async function reportedEntityMemberCollectionLoader({
  request,
  params,
}: LoaderFunctionArgs): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "GET") return methodNotAllowed();
    const actor = await requireMemberActor(request);
    const parsedParams = reportedEntityMemberCollectionParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw errors.badRequest("Invalid reported entity collection path");
    }
    const parsedQuery = reportedEntityMemberPageQuerySchema.safeParse(
      parseUniqueQuery(request)
    );
    if (!parsedQuery.success) {
      throw errors.badRequest(
        "Invalid reported entity list query",
        "bad_request:api",
        parsedQuery.error.flatten()
      );
    }
    return Response.json({
      success: true,
      ...(await listReportedEntitiesForMember(
        actor.id,
        parsedParams.data.spaceId,
        parsedQuery.data
      )),
    });
  } catch (error) {
    return memberReadError(error);
  }
}

export async function reportedEntityMemberItemLoader({
  request,
  params,
}: LoaderFunctionArgs): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "GET") return methodNotAllowed();
    const actor = await requireMemberActor(request);
    const parsedParams = reportedEntityMemberItemParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw errors.badRequest("Invalid reported entity path");
    }
    const parsedQuery = reportedEntityMemberPageQuerySchema.safeParse(
      parseUniqueQuery(request)
    );
    if (!parsedQuery.success) {
      throw errors.badRequest(
        "Invalid reported entity detail query",
        "bad_request:api",
        parsedQuery.error.flatten()
      );
    }
    return Response.json({
      success: true,
      ...(await getReportedEntityForMember(
        actor.id,
        parsedParams.data.spaceId,
        parsedParams.data.entityId,
        parsedQuery.data
      )),
    });
  } catch (error) {
    return memberReadError(error);
  }
}
