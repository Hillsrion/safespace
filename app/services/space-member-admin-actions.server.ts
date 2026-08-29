import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";

import { HttpError, errors } from "~/lib/api/http-error";
import { logServerException } from "~/lib/error/server-error.server";
import { publicDomainErrorMessage } from "~/lib/error/public";
import { requireSameOrigin } from "~/lib/security.server";
import {
  changeSpaceMemberRole,
  kickSpaceMember,
  MembershipAdminError,
} from "~/services/space-member-admin.server";
import { getCurrentUser } from "~/services/auth.server";

const paramsSchema = z.object({
  spaceId: z.string().uuid(),
  userId: z.string().uuid(),
}).strict();
const roleBodySchema = z.object({
  role: z.enum(["READ_ONLY", "EDITOR", "MODERATOR", "ADMIN"]),
}).strict();

function methodNotAllowed(allow: string): Response {
  const response = Response.json(
    { success: false, error: "Method not allowed" },
    { status: 405 }
  );
  response.headers.set("Allow", allow);
  return response;
}

function errorResponse(error: unknown, message: string): Response {
  if (error instanceof HttpError) return error.toResponse();
  if (error instanceof MembershipAdminError) {
    return Response.json(
      {
        success: false,
        error: publicDomainErrorMessage(error.status, error.message),
      },
      { status: error.status }
    );
  }
  logServerException(error, {
    operation: "space.mutate",
    errorCode: "server_error:api",
    httpStatus: 500,
  });
  // The factory throws a HttpError, which is deliberate: this helper is called
  // only at the action boundary and must not hide unexpected server failures.
  return errors.internalServerError(message);
}

export async function changeSpaceMemberRoleAction({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "PUT") return methodNotAllowed("PUT");
    requireSameOrigin(request);

    const user = await getCurrentUser(request);
    if (!user) throw errors.unauthorized("Authentication required");

    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) throw errors.badRequest("Invalid member path");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw errors.badRequest("A valid JSON body is required");
    }
    const parsedBody = roleBodySchema.safeParse(body);
    if (!parsedBody.success) throw errors.badRequest("Invalid member role");

    const member = await changeSpaceMemberRole(user, {
      ...parsedParams.data,
      role: parsedBody.data.role,
    });
    return Response.json({ success: true, member });
  } catch (error) {
    return errorResponse(error, "Failed to change member role");
  }
}

export async function kickSpaceMemberAction({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "DELETE") return methodNotAllowed("DELETE");
    requireSameOrigin(request);

    const user = await getCurrentUser(request);
    if (!user) throw errors.unauthorized("Authentication required");

    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) throw errors.badRequest("Invalid member path");

    const member = await kickSpaceMember(user, parsedParams.data);
    return Response.json({ success: true, member });
  } catch (error) {
    return errorResponse(error, "Failed to kick member");
  }
}
