import type { EffectiveSpaceAccess } from "~/services/effective-space-access.server";
import {
  redactAnonymousPost,
  withViewerPermissions,
} from "~/db/repositories/posts/queries.server";

/** Roles allowed to inspect every report state inside an accessible space. */
export function hasElevatedPostVisibility(access: EffectiveSpaceAccess) {
  return (
    access.isSuperAdmin ||
    access.role === "ADMIN" ||
    access.role === "MODERATOR"
  );
}

/**
 * Shared application-level report visibility boundary.
 *
 * Ordinary members may read active, non-administrative reports and retain
 * access to their own reports after moderation or when they chose the
 * administrator-only option. Elevated viewers may inspect every state, but
 * callers must still add an explicit space scope.
 */
export function getSpacePostVisibilityWhere(
  userId: string,
  access: EffectiveSpaceAccess
) {
  return hasElevatedPostVisibility(access)
    ? {}
    : {
        OR: [
          { status: "active" as const, isAdminOnly: false },
          { authorId: userId },
        ],
      };
}

/** Apply the same server-derived capabilities and anonymity redaction everywhere. */
export function toSafeSpacePost<
  T extends { authorId: string | null; isAnonymous: boolean; spaceId: string },
>(post: T, userId: string, access: EffectiveSpaceAccess) {
  const role = access.isSuperAdmin ? "SUPERADMIN" : access.role;
  return redactAnonymousPost(withViewerPermissions(post, userId, role));
}
