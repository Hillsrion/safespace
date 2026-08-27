import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { HttpError, errors } from "~/lib/api/http-error";
import { logServerException } from "~/lib/error/server-error.server";
import { requireSameOrigin } from "~/lib/security.server";
import { requireUser } from "~/services/auth.server";
import { sensitiveReviewDecisionSchema, sensitiveReviewPathSchema, sensitiveReviewQuerySchema, requireSensitiveReviewSchema } from "~/lib/sensitive-review";
import { decideSensitiveReview, listSensitiveReviews, requireSensitiveReview } from "~/services/sensitive-review.server";

const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown): Response {
  if (error instanceof Response) { error.headers.set("Cache-Control", "private, no-store"); return error; }
  if (error instanceof HttpError) {
    const response = error.toResponse(); response.headers.set("Cache-Control", "private, no-store"); return response;
  }
  logServerException(error, { operation: "moderation.mutate", errorCode: "server_error:api", httpStatus: 500 });
  return Response.json({ success: false, error: "Unable to process this internal review" }, { status: 500, headers });
}
const methodNotAllowed = (allow: string) => Response.json({ success: false, error: "Method not allowed" }, { status: 405, headers: { ...headers, Allow: allow } });

export async function sensitiveReviewsLoader({ request, params }: LoaderFunctionArgs) {
  try {
    if (request.method !== "GET") return methodNotAllowed("GET");
    const actor = await requireUser(request);
    const path = sensitiveReviewPathSchema.pick({ spaceId: true }).safeParse(params);
    const query = sensitiveReviewQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!path.success || !query.success) throw errors.badRequest("Invalid review queue parameters");
    return Response.json({ success: true, ...await listSensitiveReviews(actor, path.data.spaceId, query.data) }, { headers });
  } catch (error) { return failure(error); }
}

export async function sensitiveReviewAction({ request, params }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (!["POST", "PATCH"].includes(request.method)) return methodNotAllowed("POST, PATCH");
    const actor = await requireUser(request);
    const path = sensitiveReviewPathSchema.safeParse(params);
    if (!path.success) throw errors.badRequest("Invalid review path");
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) throw errors.badRequest("Content-Type must be application/json");
    const payload: unknown = await request.json().catch(() => { throw errors.badRequest("A valid JSON body is required"); });
    if (request.method === "POST") {
      const body = requireSensitiveReviewSchema.safeParse(payload);
      if (!body.success) throw errors.badRequest("A revision and classification rationale (10–2000 characters) are required");
      return Response.json(await requireSensitiveReview(actor, path.data.spaceId, path.data.postId, body.data), { status: 201, headers });
    }
    const body = sensitiveReviewDecisionSchema.safeParse(payload);
    if (!body.success) throw errors.badRequest("A revision, stage, outcome and rationale (10–2000 characters) are required");
    return Response.json(await decideSensitiveReview(actor, path.data.spaceId, path.data.postId, body.data), { headers });
  } catch (error) { return failure(error); }
}
