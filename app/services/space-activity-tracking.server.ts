import { logServerException } from "~/lib/error/server-error.server";
import { recordMemberSpaceActivity } from "~/services/member-space-activity.server";

/** Explicit, successfully loaded space only. Never mark every accessible space. */
export async function trackVisitedSpace(userId: string, spaceId: string | undefined) {
  if (!spaceId) return;
  try {
    await recordMemberSpaceActivity(userId, spaceId);
  } catch (error) {
    // An optional aggregate must not take the private feed down. Do not log IDs.
    logServerException(error, { operation: "activity.record", errorCode: "server_error:api", httpStatus: 500 });
  }
}
