import type { LoaderFunctionArgs } from "react-router";
import { HttpError, errors } from "~/lib/api/http-error";
import { parseUniqueSearchParams } from "~/lib/api/query-params";
import { logServerException } from "~/lib/error/server-error.server";
import { publicMessageForStatus } from "~/lib/error/public";
import { errorResponse } from "~/lib/api/response";
import {
  adminUserListQuerySchema,
  adminUserParamsSchema,
} from "~/lib/superadmin-users";
import { getCurrentUser } from "~/services/auth.server";
import {
  getAdminUser,
  listAdminUsers,
  SuperAdminUserError,
} from "~/services/superadmin-user.server";

function boundaryError(error: unknown, message: string): Response {
  if (error instanceof HttpError) return error.toResponse();
  if (error instanceof SuperAdminUserError) {
    return errorResponse(
      publicMessageForStatus(error.status),
      error.status === 403 ? "forbidden:auth" : "not_found:api",
      error.status
    );
  }
  logServerException(error, {
    operation: "space.mutate",
    errorCode: "server_error:api",
    httpStatus: 500,
  });
  return errorResponse(message, "server_error:api", 500);
}

async function requireActor(request: Request) {
  const actor = await getCurrentUser(request);
  if (!actor) throw errors.unauthorized("Authentication required");
  return { id: actor.id };
}

export async function listAdminUsersLoader({ request }: LoaderFunctionArgs) {
  try {
    const actor = await requireActor(request);
    const parsed = adminUserListQuerySchema.safeParse(
      parseUniqueSearchParams(request)
    );
    if (!parsed.success) {
      throw errors.badRequest(
        "Invalid user list query",
        "bad_request:api",
        parsed.error.flatten()
      );
    }
    return Response.json(
      {
        success: true,
        ...(await listAdminUsers(actor, parsed.data)),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return boundaryError(error, "Failed to list users");
  }
}

export async function getAdminUserLoader({
  request,
  params,
}: LoaderFunctionArgs) {
  try {
    const actor = await requireActor(request);
    const parsed = adminUserParamsSchema.safeParse(params);
    if (!parsed.success) throw errors.badRequest("Invalid user path");
    return Response.json(
      {
        success: true,
        user: await getAdminUser(actor, parsed.data.userId),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return boundaryError(error, "Failed to get user");
  }
}
