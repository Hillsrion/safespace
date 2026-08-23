import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";

import { HttpError, errors } from "~/lib/api/http-error";
import { requireSameOrigin } from "~/lib/security.server";
import {
  deleteAccount,
  leaveSpace,
  MemberLifecycleError,
} from "~/services/member-lifecycle.server";
import { destroySession, getSession } from "~/services/session.server";
import { getCurrentUser } from "~/services/auth.server";

const contributionPolicySchema = z.enum(["anonymize", "delete"]);
const leaveParamsSchema = z.object({ spaceId: z.string().uuid() });
const leaveSchema = z.object({
  confirmation: z.literal("LEAVE_SPACE"),
  contributionPolicy: contributionPolicySchema,
});
const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE_ACCOUNT"),
  contributionPolicy: contributionPolicySchema,
  password: z.string().min(1).max(1024),
});

function actionError(error: unknown, message: string): Response {
  if (error instanceof HttpError) return error.toResponse();
  if (error instanceof MemberLifecycleError) {
    return Response.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error(message, error);
  return errors.internalServerError(message);
}

function methodNotAllowed(allowed: string): Response {
  return Response.json(
    { success: false, error: "Method not allowed" },
    { status: 405, headers: { Allow: allowed } }
  );
}

async function successAndDestroySession(request: Request, body: unknown): Promise<Response> {
  const session = await getSession(request);
  return Response.json(body, {
    headers: { "Set-Cookie": await destroySession(session) },
  });
}

export async function leaveSpaceAction({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "POST") {
      return methodNotAllowed("POST");
    }
    const user = await getCurrentUser(request);
    if (!user) throw errors.unauthorized("Authentication required");

    const parsedParams = leaveParamsSchema.safeParse(params);
    if (!parsedParams.success) throw errors.badRequest("Invalid space path");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw errors.badRequest("A valid JSON body is required");
    }
    const parsedBody = leaveSchema.safeParse(body);
    if (!parsedBody.success) throw errors.badRequest("Explicit leave confirmation is required");

    const result = await leaveSpace(user, {
      spaceId: parsedParams.data.spaceId,
      contributionPolicy: parsedBody.data.contributionPolicy,
    });
    return successAndDestroySession(request, { success: true, leave: result });
  } catch (error) {
    return actionError(error, "Failed to leave space");
  }
}

export async function deleteAccountAction({ request }: ActionFunctionArgs): Promise<Response> {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "DELETE") {
      return methodNotAllowed("DELETE");
    }
    const user = await getCurrentUser(request);
    if (!user) throw errors.unauthorized("Authentication required");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw errors.badRequest("A valid JSON body is required");
    }
    const parsedBody = deleteAccountSchema.safeParse(body);
    if (!parsedBody.success) {
      throw errors.badRequest("Password and explicit account deletion confirmation are required");
    }

    const result = await deleteAccount(user, parsedBody.data);
    return successAndDestroySession(request, { success: true, account: result });
  } catch (error) {
    return actionError(error, "Failed to delete account");
  }
}
