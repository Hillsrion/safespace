import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { HttpError, errors } from "~/lib/api/http-error";
import { logServerException } from "~/lib/error/server-error.server";
import {
  savedSearchCreateSchema,
  savedSearchIdParamsSchema,
  savedSearchUpdateSchema,
} from "~/lib/search";
import { requireSameOrigin } from "~/lib/security.server";
import { requireUser } from "~/services/auth.server";
import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearch,
  listSavedSearches,
  updateSavedSearch,
} from "~/services/saved-searches.server";

function methodNotAllowed(allowed: string): Response {
  return Response.json(
    { success: false, error: "Method not allowed", code: "bad_request:api" },
    { status: 405, headers: { Allow: allowed } }
  );
}

function errorResponse(error: unknown, message: string): Response {
  if (error instanceof HttpError) return error.toResponse();
  logServerException(error, {
    operation: "search.execute",
    errorCode: "server_error:api",
    httpStatus: 500,
  });
  return Response.json(
    { success: false, error: message, code: "server_error:api" },
    { status: 500 }
  );
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw errors.badRequest("Content-Type must be application/json");
  }
  try {
    return await request.json();
  } catch {
    throw errors.badRequest("A valid JSON body is required");
  }
}

export async function savedSearchesLoader({ request }: LoaderFunctionArgs) {
  try {
    if (request.method.toUpperCase() !== "GET") return methodNotAllowed("GET");
    const actor = await requireUser(request);
    return Response.json({
      success: true,
      savedSearches: await listSavedSearches(actor),
    });
  } catch (error) {
    return errorResponse(error, "Failed to load saved searches");
  }
}

export async function createSavedSearchAction({ request }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "POST") return methodNotAllowed("POST");
    const actor = await requireUser(request);
    const parsed = savedSearchCreateSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw errors.badRequest(
        "Invalid saved search payload",
        "bad_request:api",
        parsed.error.flatten()
      );
    }
    return Response.json(
      { success: true, savedSearch: await createSavedSearch(actor, parsed.data) },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "Failed to create saved search");
  }
}

function savedSearchId(params: Record<string, string | undefined>) {
  const parsed = savedSearchIdParamsSchema.safeParse(params);
  if (!parsed.success) throw errors.badRequest("Invalid saved search path");
  return parsed.data.savedSearchId;
}

export async function savedSearchLoader({ request, params }: LoaderFunctionArgs) {
  try {
    if (request.method.toUpperCase() !== "GET") return methodNotAllowed("GET");
    const actor = await requireUser(request);
    return Response.json({
      success: true,
      savedSearch: await getSavedSearch(actor, savedSearchId(params)),
    });
  } catch (error) {
    return errorResponse(error, "Failed to load saved search");
  }
}

export async function mutateSavedSearchAction({
  request,
  params,
}: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    const method = request.method.toUpperCase();
    if (method !== "PATCH" && method !== "DELETE") {
      return methodNotAllowed("PATCH, DELETE");
    }
    const actor = await requireUser(request);
    const id = savedSearchId(params);
    if (method === "DELETE") {
      return Response.json({
        success: true,
        ...(await deleteSavedSearch(actor, id)),
      });
    }

    const parsed = savedSearchUpdateSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw errors.badRequest(
        "Invalid saved search payload",
        "bad_request:api",
        parsed.error.flatten()
      );
    }
    return Response.json({
      success: true,
      savedSearch: await updateSavedSearch(actor, id, parsed.data),
    });
  } catch (error) {
    return errorResponse(error, "Failed to update saved search");
  }
}
