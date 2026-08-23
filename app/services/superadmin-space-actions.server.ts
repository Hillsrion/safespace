import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { HttpError, errors } from "~/lib/api/http-error";
import { errorResponse as apiErrorResponse } from "~/lib/api/response";
import { requireSameOrigin } from "~/lib/security.server";
import {
  adminSpaceListQuerySchema,
  adminSpaceParamsSchema,
  auditLogQuerySchema,
  createAdminSpaceSchema,
  deleteAdminSpaceSchema,
  updateAdminSpaceSchema,
} from "~/lib/superadmin-spaces";
import { getCurrentUser } from "~/services/auth.server";
import {
  createAdminSpace,
  deleteAdminSpace,
  getAdminSpace,
  listAdminAuditLogs,
  listAdminSpaces,
  SuperAdminSpaceError,
  updateAdminSpace,
} from "~/services/superadmin-space.server";

function actionErrorResponse(error: unknown, message: string): Response {
  if (error instanceof HttpError) return error.toResponse();
  if (error instanceof SuperAdminSpaceError) {
    const code =
      error.status === 403
        ? "forbidden:auth"
        : error.status === 404
          ? "not_found:api"
          : "bad_request:api";
    return apiErrorResponse(error.message, code, error.status, error.details);
  }
  console.error(message, error);
  return apiErrorResponse(message, "server_error:api", 500);
}

async function requireActor(request: Request) {
  const actor = await getCurrentUser(request);
  if (!actor) throw errors.unauthorized("Authentication required");
  return { id: actor.id };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw errors.badRequest("A valid JSON body is required");
  }
}

function parseQuery(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}

function methodNotAllowed(allow: string): Response {
  const response = apiErrorResponse(
    "Method not allowed",
    "bad_request:api",
    405
  );
  response.headers.set("Allow", allow);
  return response;
}

export async function listAdminSpacesLoader({ request }: LoaderFunctionArgs) {
  try {
    const actor = await requireActor(request);
    const parsed = adminSpaceListQuerySchema.safeParse(parseQuery(request));
    if (!parsed.success) {
      throw errors.badRequest(
        "Invalid space list query",
        "bad_request:api",
        parsed.error.flatten()
      );
    }
    return Response.json({ success: true, ...(await listAdminSpaces(actor, parsed.data)) });
  } catch (error) {
    return actionErrorResponse(error, "Failed to list spaces");
  }
}

export async function createAdminSpaceAction({ request }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "POST") return methodNotAllowed("POST");
    const actor = await requireActor(request);
    const parsed = createAdminSpaceSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw errors.badRequest(
        "Invalid space payload",
        "bad_request:api",
        parsed.error.flatten()
      );
    }
    return Response.json(
      { success: true, space: await createAdminSpace(actor, parsed.data) },
      { status: 201 }
    );
  } catch (error) {
    return actionErrorResponse(error, "Failed to create space");
  }
}

export async function getAdminSpaceLoader({ request, params }: LoaderFunctionArgs) {
  try {
    const actor = await requireActor(request);
    const parsed = adminSpaceParamsSchema.safeParse(params);
    if (!parsed.success) throw errors.badRequest("Invalid space path");
    return Response.json({
      success: true,
      space: await getAdminSpace(actor, parsed.data.spaceId),
    });
  } catch (error) {
    return actionErrorResponse(error, "Failed to get space");
  }
}

export async function mutateAdminSpaceAction({ request, params }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    const method = request.method.toUpperCase();
    if (method !== "PATCH" && method !== "DELETE") {
      return methodNotAllowed("PATCH, DELETE");
    }
    const actor = await requireActor(request);
    const parsedParams = adminSpaceParamsSchema.safeParse(params);
    if (!parsedParams.success) throw errors.badRequest("Invalid space path");
    const body = await readJson(request);

    if (method === "PATCH") {
      const parsed = updateAdminSpaceSchema.safeParse(body);
      if (!parsed.success) {
        throw errors.badRequest(
          "Invalid space payload",
          "bad_request:api",
          parsed.error.flatten()
        );
      }
      return Response.json({
        success: true,
        space: await updateAdminSpace(actor, parsedParams.data.spaceId, parsed.data),
      });
    }

    const parsed = deleteAdminSpaceSchema.safeParse(body);
    if (!parsed.success) {
      throw errors.badRequest(
        "Invalid deletion confirmation",
        "bad_request:api",
        parsed.error.flatten()
      );
    }
    const result = await deleteAdminSpace(
      actor,
      parsedParams.data.spaceId,
      parsed.data.confirmation
    );
    return Response.json({ success: true, ...result });
  } catch (error) {
    return actionErrorResponse(error, "Failed to mutate space");
  }
}

export async function listAdminAuditLogsLoader({ request }: LoaderFunctionArgs) {
  try {
    const actor = await requireActor(request);
    const parsed = auditLogQuerySchema.safeParse(parseQuery(request));
    if (!parsed.success) {
      throw errors.badRequest(
        "Invalid audit log query",
        "bad_request:api",
        parsed.error.flatten()
      );
    }
    return Response.json({
      success: true,
      ...(await listAdminAuditLogs(actor, parsed.data)),
    });
  } catch (error) {
    return actionErrorResponse(error, "Failed to list audit logs");
  }
}
