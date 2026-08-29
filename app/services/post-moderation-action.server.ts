import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";

import { prisma } from "~/db/client.server";
import { updatePostStatus } from "~/db/repositories/posts/queries.server";
import { HttpError, errors } from "~/lib/api/http-error";
import { errorResponse } from "~/lib/api/response";
import { logServerException } from "~/lib/error/server-error.server";
import { requireSameOrigin } from "~/lib/security.server";
import { getCurrentUser } from "~/services/auth.server";

const paramsSchema = z.object({
  spaceId: z.string().uuid(),
  postId: z.string().uuid(),
}).strict();
const bodySchema = z.object({
  action: z.enum(["hide", "unhide"]),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict();

function methodNotAllowed() {
  const response = errorResponse("Method not allowed", "bad_request:api", 405);
  response.headers.set("Allow", "PUT");
  return response;
}

export async function moderateSpacePostAction({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "PUT") return methodNotAllowed();
    requireSameOrigin(request);
    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) throw errors.badRequest("Invalid moderation path");
    const user = await getCurrentUser(request);
    if (!user) throw errors.unauthorized("Authentication required");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw errors.badRequest("A valid JSON body is required");
    }
    const parsedBody = bodySchema.safeParse(body);
    if (!parsedBody.success) throw errors.badRequest("Invalid moderation payload");

    await updatePostStatus(
      parsedParams.data.postId,
      parsedBody.data.action === "hide" ? "hidden" : "active",
      user.id,
      prisma,
      {
        expectedSpaceId: parsedParams.data.spaceId,
        reason: parsedBody.data.reason,
      }
    );
    return Response.json({ success: true, action: parsedBody.data.action });
  } catch (error) {
    if (error instanceof HttpError) return error.toResponse();
    logServerException(error, {
      operation: "post.update",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
    return errorResponse("Unable to moderate the report", "server_error:api", 500);
  }
}
