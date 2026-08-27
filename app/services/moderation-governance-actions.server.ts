import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { HttpError, errors } from "~/lib/api/http-error";
import { logServerException } from "~/lib/error/server-error.server";
import {
  appealDecisionSchema,
  appealsQuerySchema,
  createAppealSchema,
  createDisciplineSchema,
  disciplinePathSchema,
  memberHistoryPathSchema,
  moderationAppealPathSchema,
  moderationSpacePathSchema,
  revokeDisciplineSchema,
} from "~/lib/moderation-governance";
import { requireSameOrigin } from "~/lib/security.server";
import { requireUser } from "~/services/auth.server";
import {
  createModerationAppeal,
  decideModerationAppeal,
  getMemberModerationHistory,
  issueProgressiveDiscipline,
  listModerationAppeals,
  revokeDisciplinaryAction,
} from "~/services/moderation-governance.server";

function methodNotAllowed(allowed: string) {
  return Response.json(
    { success: false, error: "Method not allowed", code: "bad_request:api" },
    { status: 405, headers: { Allow: allowed } }
  );
}

function failure(error: unknown, message: string): Response {
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

const privateResponse = { "Cache-Control": "private, no-store" };

async function json(request: Request): Promise<unknown> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw errors.badRequest("Content-Type must be application/json");
  }
  try {
    return await request.json();
  } catch {
    throw errors.badRequest("A valid JSON body is required");
  }
}

function parsePath<T>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  params: unknown,
  message: string
): T {
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw errors.badRequest(message);
  return parsed.data;
}

export async function createModerationAppealAction({ request, params }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "POST") return methodNotAllowed("POST");
    const actor = await requireUser(request);
    const { spaceId } = parsePath(moderationSpacePathSchema, params, "Invalid moderation appeal path");
    const body = createAppealSchema.safeParse(await json(request));
    if (!body.success) throw errors.badRequest("Invalid moderation appeal payload", "bad_request:api", body.error.flatten());
    return Response.json(
      { success: true, appeal: await createModerationAppeal(actor, spaceId, body.data) },
      { status: 201, headers: privateResponse }
    );
  } catch (error) {
    return failure(error, "Failed to create moderation appeal");
  }
}

export async function moderationAppealsLoader({ request, params }: LoaderFunctionArgs) {
  try {
    if (request.method.toUpperCase() !== "GET") return methodNotAllowed("GET");
    const actor = await requireUser(request);
    const { spaceId } = parsePath(moderationSpacePathSchema, params, "Invalid moderation appeals path");
    const query = appealsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw errors.badRequest("Invalid moderation appeals query", "bad_request:api", query.error.flatten());
    return Response.json(
      { success: true, ...(await listModerationAppeals(actor, spaceId, query.data)) },
      { headers: privateResponse }
    );
  } catch (error) {
    return failure(error, "Failed to load moderation appeals");
  }
}

export async function decideModerationAppealAction({ request, params }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "PATCH") return methodNotAllowed("PATCH");
    const actor = await requireUser(request);
    const { spaceId, appealId } = parsePath(moderationAppealPathSchema, params, "Invalid moderation appeal path");
    const body = appealDecisionSchema.safeParse(await json(request));
    if (!body.success) throw errors.badRequest("Invalid appeal decision payload", "bad_request:api", body.error.flatten());
    return Response.json(
      {
        success: true,
        appeal: await decideModerationAppeal(actor, spaceId, appealId, body.data),
      },
      { headers: privateResponse }
    );
  } catch (error) {
    return failure(error, "Failed to decide moderation appeal");
  }
}

export async function issueDisciplineAction({ request, params }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "POST") return methodNotAllowed("POST");
    const actor = await requireUser(request);
    const { spaceId } = parsePath(moderationSpacePathSchema, params, "Invalid discipline path");
    const body = createDisciplineSchema.safeParse(await json(request));
    if (!body.success) throw errors.badRequest("Invalid discipline payload", "bad_request:api", body.error.flatten());
    return Response.json(
      { success: true, action: await issueProgressiveDiscipline(actor, spaceId, body.data) },
      { status: 201, headers: privateResponse }
    );
  } catch (error) {
    return failure(error, "Failed to issue disciplinary action");
  }
}

export async function revokeDisciplineAction({ request, params }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "PATCH") return methodNotAllowed("PATCH");
    const actor = await requireUser(request);
    const { spaceId, disciplineId } = parsePath(disciplinePathSchema, params, "Invalid discipline path");
    const body = revokeDisciplineSchema.safeParse(await json(request));
    if (!body.success) throw errors.badRequest("Invalid revocation payload", "bad_request:api", body.error.flatten());
    return Response.json(
      {
        success: true,
        action: await revokeDisciplinaryAction(actor, spaceId, disciplineId, body.data),
      },
      { headers: privateResponse }
    );
  } catch (error) {
    return failure(error, "Failed to revoke disciplinary action");
  }
}

export async function memberModerationHistoryLoader({ request, params }: LoaderFunctionArgs) {
  try {
    if (request.method.toUpperCase() !== "GET") return methodNotAllowed("GET");
    const actor = await requireUser(request);
    const { spaceId, userId } = parsePath(memberHistoryPathSchema, params, "Invalid member history path");
    return Response.json(
      {
        success: true,
        ...(await getMemberModerationHistory(actor, spaceId, userId)),
      },
      { headers: privateResponse }
    );
  } catch (error) {
    return failure(error, "Failed to load member moderation history");
  }
}
