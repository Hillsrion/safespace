import type { LoaderFunctionArgs } from "react-router";
import { z } from "zod";

import { prisma } from "~/db/client.server";
import type { PrismaClient } from "~/generated/prisma";
import { HttpError, errors } from "~/lib/api/http-error";
import { errorResponse } from "~/lib/api/response";
import { logServerException } from "~/lib/error/server-error.server";
import { getCurrentUser } from "~/services/auth.server";
import { getEffectiveSpaceAccess } from "~/services/effective-space-access.server";

const paramsSchema = z.object({ spaceId: z.string().uuid() }).strict();

type SpaceMemberClient = Pick<
  PrismaClient,
  "user" | "userSpaceMembership" | "disciplinaryAction" | "space"
>;

function methodNotAllowed() {
  const response = errorResponse("Method not allowed", "bad_request:api", 405);
  response.headers.set("Allow", "GET");
  return response;
}

function boundaryError(error: unknown) {
  if (error instanceof HttpError) return error.toResponse();
  logServerException(error, {
    operation: "database.query",
    errorCode: "server_error:api",
    httpStatus: 500,
  });
  return errorResponse("Unable to read the space", "server_error:api", 500);
}

/** Return only member-safe space metadata after resolving current discipline. */
export async function getSpaceForMember(
  userId: string,
  spaceId: string,
  client: SpaceMemberClient = prisma
) {
  const access = await getEffectiveSpaceAccess(client, userId, spaceId);
  if (!access.isSuperAdmin && access.role === null) {
    throw errors.notFound("Space not found");
  }

  const space = await client.space.findFirst({
    where: { id: spaceId },
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!space) throw errors.notFound("Space not found");

  return {
    id: space.id,
    name: space.name,
    description: space.description,
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
    currentUserRole: access.isSuperAdmin ? "SUPERADMIN" : access.role,
  };
}

export async function spaceMemberItemLoader({
  request,
  params,
}: LoaderFunctionArgs): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "GET") return methodNotAllowed();
    if (new URL(request.url).searchParams.size > 0) {
      throw errors.badRequest("Space detail does not accept query parameters");
    }
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) throw errors.badRequest("Invalid space path");
    const user = await getCurrentUser(request);
    if (!user) throw errors.unauthorized("Authentication required");

    return Response.json({
      success: true,
      space: await getSpaceForMember(user.id, parsed.data.spaceId),
    });
  } catch (error) {
    return boundaryError(error);
  }
}
