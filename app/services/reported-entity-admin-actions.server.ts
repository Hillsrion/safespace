import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { HttpError, errors } from "~/lib/api/http-error";
import { logServerException } from "~/lib/error/server-error.server";
import { publicMessageForStatus } from "~/lib/error/public";
import { errorResponse as apiErrorResponse } from "~/lib/api/response";
import {
  createReportedEntitySchema,
  reportedEntityCollectionParamsSchema,
  reportedEntityItemParamsSchema,
  reportedEntityListQuerySchema,
  updateReportedEntitySchema,
} from "~/lib/reported-entities";
import { requireSameOrigin } from "~/lib/security.server";
import { getCurrentUser } from "~/services/auth.server";
import {
  createReportedEntityForAdmin,
  deleteReportedEntityForAdmin,
  getReportedEntityForAdmin,
  listReportedEntitiesForAdmin,
  ReportedEntityAdminError,
  updateReportedEntityForAdmin,
  reviewReportedEntityHandle,
} from "~/services/reported-entity-admin.server";
import { z } from "zod";

const handleReviewParamsSchema = z.object({
  spaceId: z.string().uuid(), entityId: z.string().uuid(), handleId: z.string().uuid(),
});
const handleReviewSchema = z.union([
  z.object({
    status: z.literal("unreviewed"),
    note: z.string().trim().min(3).max(500).optional(),
  }).strict(),
  z.object({
    status: z.enum(["consistent", "questionable", "obsolete"]),
    note: z.string().trim().min(3).max(500),
  }).strict(),
]);

function errorResponse(error: unknown, message: string): Response {
  if (error instanceof HttpError) return error.toResponse();
  if (error instanceof ReportedEntityAdminError) {
    const code =
      error.status === 403
        ? "forbidden:auth"
        : error.status === 404
          ? "not_found:api"
          : "bad_request:api";
    return apiErrorResponse(publicMessageForStatus(error.status), code, error.status);
  }
  logServerException(error, {
    operation: "moderation.mutate",
    errorCode: "server_error:api",
    httpStatus: 500,
  });
  return apiErrorResponse(message, "server_error:api", 500);
}

function methodNotAllowed(allowed: string): Response {
  const response = apiErrorResponse("Method not allowed", "bad_request:api", 405);
  response.headers.set("Allow", allowed);
  return response;
}

async function requireActor(request: Request): Promise<{ id: string }> {
  const actor = await getCurrentUser(request);
  if (!actor) throw errors.unauthorized("Authentication required");
  return { id: actor.id };
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type")?.toLowerCase();
  if (!contentType?.startsWith("application/json")) {
    throw errors.badRequest("Content-Type must be application/json");
  }
  try {
    return await request.json();
  } catch {
    throw errors.badRequest("A valid JSON body is required");
  }
}

function parseQuery(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}

export async function reviewReportedEntityHandleAction({ request, params }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "PATCH") return methodNotAllowed("PATCH");
    const actor = await requireActor(request);
    const parsedParams = handleReviewParamsSchema.safeParse(params);
    const parsedBody = handleReviewSchema.safeParse(await readJson(request));
    if (!parsedParams.success || !parsedBody.success) throw errors.badRequest("Invalid handle review");
    return Response.json({ success: true, review: await reviewReportedEntityHandle(
      actor, parsedParams.data.spaceId, parsedParams.data.entityId,
      parsedParams.data.handleId, parsedBody.data
    ) });
  } catch (error) {
    return errorResponse(error, "Failed to review reported entity handle");
  }
}

export async function listReportedEntitiesLoader({
  request,
  params,
}: LoaderFunctionArgs): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "GET") return methodNotAllowed("GET");
    const actor = await requireActor(request);
    const parsedParams = reportedEntityCollectionParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw errors.badRequest("Invalid reported entity collection path");
    }
    const parsedQuery = reportedEntityListQuerySchema.safeParse(parseQuery(request));
    if (!parsedQuery.success) {
      throw errors.badRequest(
        "Invalid reported entity list query",
        "bad_request:api",
        parsedQuery.error.flatten()
      );
    }
    return Response.json({
      success: true,
      ...(await listReportedEntitiesForAdmin(
        actor,
        parsedParams.data.spaceId,
        parsedQuery.data
      )),
    });
  } catch (error) {
    return errorResponse(error, "Failed to list reported entities");
  }
}

export async function createReportedEntityAction({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "POST") return methodNotAllowed("POST");
    const actor = await requireActor(request);
    const parsedParams = reportedEntityCollectionParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw errors.badRequest("Invalid reported entity collection path");
    }
    const parsedBody = createReportedEntitySchema.safeParse(await readJson(request));
    if (!parsedBody.success) {
      throw errors.badRequest(
        "Invalid reported entity payload",
        "bad_request:api",
        parsedBody.error.flatten()
      );
    }
    return Response.json(
      {
        success: true,
        entity: await createReportedEntityForAdmin(
          actor,
          parsedParams.data.spaceId,
          parsedBody.data
        ),
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "Failed to create reported entity");
  }
}

export async function getReportedEntityLoader({
  request,
  params,
}: LoaderFunctionArgs): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "GET") return methodNotAllowed("GET");
    const actor = await requireActor(request);
    const parsedParams = reportedEntityItemParamsSchema.safeParse(params);
    if (!parsedParams.success) throw errors.badRequest("Invalid reported entity path");
    return Response.json({
      success: true,
      entity: await getReportedEntityForAdmin(
        actor,
        parsedParams.data.spaceId,
        parsedParams.data.entityId
      ),
    });
  } catch (error) {
    return errorResponse(error, "Failed to get reported entity");
  }
}

export async function mutateReportedEntityAction({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    requireSameOrigin(request);
    const method = request.method.toUpperCase();
    if (method !== "PATCH" && method !== "DELETE") {
      return methodNotAllowed("PATCH, DELETE");
    }
    const actor = await requireActor(request);
    const parsedParams = reportedEntityItemParamsSchema.safeParse(params);
    if (!parsedParams.success) throw errors.badRequest("Invalid reported entity path");

    if (method === "PATCH") {
      const parsedBody = updateReportedEntitySchema.safeParse(await readJson(request));
      if (!parsedBody.success) {
        throw errors.badRequest(
          "Invalid reported entity payload",
          "bad_request:api",
          parsedBody.error.flatten()
        );
      }
      return Response.json({
        success: true,
        entity: await updateReportedEntityForAdmin(
          actor,
          parsedParams.data.spaceId,
          parsedParams.data.entityId,
          parsedBody.data
        ),
      });
    }

    return Response.json({
      success: true,
      ...(await deleteReportedEntityForAdmin(
        actor,
        parsedParams.data.spaceId,
        parsedParams.data.entityId
      )),
    });
  } catch (error) {
    return errorResponse(error, "Failed to mutate reported entity");
  }
}
