import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { errors, HttpError } from "~/lib/api/http-error";
import { errorResponse } from "~/lib/api/response";
import { publicMessageForStatus } from "~/lib/error/public";
import { logServerException } from "~/lib/error/server-error.server";
import { requireSameOrigin } from "~/lib/security.server";
import { createSystemAnnouncementSchema, systemAnnouncementParamsSchema, updateSystemAnnouncementSchema } from "~/lib/system-announcements";
import { getCurrentUser } from "~/services/auth.server";
import { createSystemAnnouncement, deleteSystemAnnouncement, listActiveSystemAnnouncements, listSystemAnnouncements, SystemAnnouncementError, updateSystemAnnouncement } from "~/services/system-announcements.server";

async function actor(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) throw errors.unauthorized("Authentication required");
  return { id: user.id };
}
async function json(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw errors.badRequest("A valid JSON body is required"); }
}
function failure(error: unknown, fallback: string): Response {
  if (error instanceof HttpError) return error.toResponse();
  if (error instanceof SystemAnnouncementError) return errorResponse(publicMessageForStatus(error.status), error.status === 403 ? "forbidden:auth" : error.status === 404 ? "not_found:api" : "bad_request:api", error.status);
  logServerException(error, { operation: "system_announcement.mutate", errorCode: "server_error:api", httpStatus: 500 });
  return errorResponse(fallback, "server_error:api", 500);
}
function methodNotAllowed(allow: string) {
  const response = errorResponse("Method not allowed", "bad_request:api", 405);
  response.headers.set("Allow", allow);
  return response;
}
export async function activeAnnouncementsLoader({ request }: LoaderFunctionArgs) {
  try { return Response.json({ success: true, announcements: await listActiveSystemAnnouncements(await actor(request)) }); }
  catch (error) { return failure(error, "Failed to list announcements"); }
}
export async function adminAnnouncementsLoader({ request }: LoaderFunctionArgs) {
  try { return Response.json({ success: true, announcements: await listSystemAnnouncements(await actor(request)) }); }
  catch (error) { return failure(error, "Failed to list announcements"); }
}
export async function createAnnouncementAction({ request }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    if (request.method.toUpperCase() !== "POST") return methodNotAllowed("POST");
    const parsed = createSystemAnnouncementSchema.safeParse(await json(request));
    if (!parsed.success) throw errors.badRequest("Invalid announcement payload", "bad_request:api", parsed.error.flatten());
    return Response.json({ success: true, announcement: await createSystemAnnouncement(await actor(request), parsed.data) }, { status: 201 });
  } catch (error) { return failure(error, "Failed to create announcement"); }
}
export async function mutateAnnouncementAction({ request, params }: ActionFunctionArgs) {
  try {
    requireSameOrigin(request);
    const method = request.method.toUpperCase();
    if (method !== "PATCH" && method !== "DELETE") return methodNotAllowed("PATCH, DELETE");
    const path = systemAnnouncementParamsSchema.safeParse(params);
    if (!path.success) throw errors.badRequest("Invalid announcement path");
    const currentActor = await actor(request);
    if (method === "DELETE") return Response.json({ success: true, ...(await deleteSystemAnnouncement(currentActor, path.data.announcementId)) });
    const parsed = updateSystemAnnouncementSchema.safeParse(await json(request));
    if (!parsed.success) throw errors.badRequest("Invalid announcement payload", "bad_request:api", parsed.error.flatten());
    return Response.json({ success: true, announcement: await updateSystemAnnouncement(currentActor, path.data.announcementId, parsed.data) });
  } catch (error) { return failure(error, "Failed to update announcement"); }
}
