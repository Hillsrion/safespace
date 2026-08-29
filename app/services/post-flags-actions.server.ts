import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import {
  createPostFlag,
  decideModerationFlag,
  listModerationFlags,
} from "~/db/repositories/posts/flags.server";
import { HttpError, errors } from "~/lib/api/http-error";
import { logServerException } from "~/lib/error/server-error.server";
import {
  moderationDecisionSchema,
  moderationFlagPathSchema,
  moderationFlagsPathSchema,
  moderationFlagsQuerySchema,
  postFlagBodySchema,
  postFlagPathSchema,
} from "~/lib/post-flags";
import { requireSameOrigin } from "~/lib/security.server";
import { requireUser } from "~/services/auth.server";

function methodNotAllowed(allowed: string): Response {
  return Response.json(
    {
      success: false,
      error: "Method not allowed",
      code: "bad_request:api",
    },
    { status: 405, headers: { Allow: allowed } }
  );
}

function unexpectedError(error: unknown, message: string): Response {
  if (error instanceof HttpError) return error.toResponse();
  logServerException(error, {
    operation: "moderation.mutate",
    errorCode: "server_error:api",
    httpStatus: 500,
  });
  return Response.json(
    { success: false, error: message, code: "server_error:api" },
    { status: 500 }
  );
}

async function readJsonObject(request: Request): Promise<unknown> {
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

function parseUniqueQuery(request: Request): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(values, key)) {
      throw errors.badRequest("Duplicate moderation queue query parameter");
    }
    values[key] = value;
  }
  return values;
}

export async function createPostFlagAction({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "POST") {
      return methodNotAllowed("POST");
    }

    const actor = await requireUser(request);
    const parsedPath = postFlagPathSchema.safeParse(params);
    if (!parsedPath.success) {
      throw errors.badRequest(
        "Invalid post flag path",
        "bad_request:api",
        parsedPath.error.flatten()
      );
    }

    const parsedBody = postFlagBodySchema.safeParse(
      await readJsonObject(request)
    );
    if (!parsedBody.success) {
      throw errors.badRequest(
        "Invalid post flag payload",
        "bad_request:api",
        parsedBody.error.flatten()
      );
    }

    const flag = await createPostFlag(actor, {
      ...parsedPath.data,
      ...parsedBody.data,
    });
    return Response.json({ success: true, flag }, { status: 201 });
  } catch (error) {
    return unexpectedError(error, "Failed to flag post");
  }
}

export async function moderationFlagsLoader({
  request,
  params,
}: LoaderFunctionArgs): Promise<Response> {
  try {
    if (request.method.toUpperCase() !== "GET") {
      return methodNotAllowed("GET");
    }

    const actor = await requireUser(request);
    const parsedPath = moderationFlagsPathSchema.safeParse(params);
    if (!parsedPath.success) {
      throw errors.badRequest(
        "Invalid moderation queue path",
        "bad_request:api",
        parsedPath.error.flatten()
      );
    }

    const parsedQuery = moderationFlagsQuerySchema.safeParse(
      parseUniqueQuery(request)
    );
    if (!parsedQuery.success) {
      throw errors.badRequest(
        "Invalid moderation queue query",
        "bad_request:api",
        parsedQuery.error.flatten()
      );
    }

    return Response.json(
      await listModerationFlags(actor, {
        ...parsedPath.data,
        ...parsedQuery.data,
      })
    );
  } catch (error) {
    return unexpectedError(error, "Failed to load moderation queue");
  }
}

export async function decideModerationFlagAction({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "PATCH") {
      return methodNotAllowed("PATCH");
    }

    const actor = await requireUser(request);
    const parsedPath = moderationFlagPathSchema.safeParse(params);
    if (!parsedPath.success) {
      throw errors.badRequest(
        "Invalid moderation decision path",
        "bad_request:api",
        parsedPath.error.flatten()
      );
    }

    const parsedBody = moderationDecisionSchema.safeParse(
      await readJsonObject(request)
    );
    if (!parsedBody.success) {
      throw errors.badRequest(
        "Invalid moderation decision payload",
        "bad_request:api",
        parsedBody.error.flatten()
      );
    }

    const flag = await decideModerationFlag(actor, {
      ...parsedPath.data,
      ...parsedBody.data,
    });
    return Response.json({ success: true, flag });
  } catch (error) {
    return unexpectedError(error, "Failed to decide moderation flag");
  }
}
