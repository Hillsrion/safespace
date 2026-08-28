import { prisma } from "~/db/client.server";
import { toEvidenceMedia } from "~/lib/evidence";
import type { PrismaClient } from "~/generated/prisma";
import type { ReportedEntityWithHandles, ReportedEntityPost } from "./types";
import {
  normalizeViewerRole,
  redactAnonymousPost,
  withViewerPermissions,
} from "../posts/queries.server";

const ELEVATED_ROLES = [
  "ADMIN",
  "MODERATOR",
  "Admin",
  "Moderator",
  "admin",
  "moderator",
] as const;

export function getReportedEntityPostAccessFilter(
  reportedEntityId: string,
  spaceId: string,
  user: { id: string; isSuperAdmin: boolean }
) {
  const target = { reportedEntityId, spaceId };
  if (user.isSuperAdmin) return target;

  return {
    ...target,
    status: "active" as const,
    space: { memberships: { some: { userId: user.id } } },
    OR: [
      { isAdminOnly: false },
      {
        isAdminOnly: true,
        space: {
          memberships: {
            some: {
              userId: user.id,
              role: { in: [...ELEVATED_ROLES] },
            },
          },
        },
      },
    ],
  };
}

/**
 * Fetches a ReportedEntity by its ID, including its handles.
 *
 * @param reportedEntityId The ID of the ReportedEntity to fetch.
 * @returns The ReportedEntity with its handles, or null if not found.
 */
export async function getReportedEntityById(
  reportedEntityId: string
): Promise<ReportedEntityWithHandles | null> {
  return prisma.reportedEntity.findUnique({
    where: { id: reportedEntityId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      handles: { select: { id: true, handle: true, platform: true } },
    },
  });
}

export async function getAccessibleReportedEntityById(
  reportedEntityId: string,
  userId: string
): Promise<ReportedEntityWithHandles | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });

  if (!user) return null;

  if (user.isSuperAdmin) {
    return getReportedEntityById(reportedEntityId);
  }

  return prisma.reportedEntity.findFirst({
    where: {
      id: reportedEntityId,
      space: { memberships: { some: { userId } } },
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      handles: { select: { id: true, handle: true, platform: true } },
    },
  });
}

/**
 * Fetches all posts associated with a ReportedEntity, filtered by the current user's access rights.
 *
 * @param reportedEntityId The ID of the ReportedEntity.
 * @param userId The ID of the user requesting the posts.
 * @returns A list of posts associated with the ReportedEntity, filtered by access rights.
 */
export async function getReportedEntityPosts(
  reportedEntityId: string,
  userId: string,
  client: PrismaClient = prisma
): Promise<ReportedEntityPost[]> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isSuperAdmin: true,
      memberships: { select: { spaceId: true, role: true } },
    },
  });

  if (!user) {
    // Or handle this case as per your application's error handling strategy
    throw new Error("User not found");
  }

  // Resolve the entity's own space again here. The route performs an access
  // check too, but repository-level scoping prevents a direct caller (or an
  // inconsistent post/entity relation) from exposing cross-space posts.
  const accessibleEntity = await client.reportedEntity.findFirst({
    where: user.isSuperAdmin
      ? { id: reportedEntityId }
      : {
          id: reportedEntityId,
          space: { memberships: { some: { userId } } },
        },
    select: { spaceId: true },
  });
  if (!accessibleEntity) return [];

  const viewerRole = user.isSuperAdmin
    ? "SUPERADMIN"
    : normalizeViewerRole(
        user.memberships.find(
          (membership) => membership.spaceId === accessibleEntity.spaceId
        )?.role
      );

  const whereConditions = getReportedEntityPostAccessFilter(
    reportedEntityId,
    accessibleEntity.spaceId,
    user
  );

  const posts = await client.post.findMany({
    where: whereConditions,
    include: {
      author: {
        // Assuming relation name on Post model is 'author' to User model
        select: {
          id: true,
          firstName: true,
          lastName: true,
          instagram: true,
        },
      },
      space: {
        // Assuming relation name on Post model is 'space' to Space model
        select: {
          id: true,
          name: true,
          // url: true, // TPost's SpaceInfo expects a URL. Assuming Space model has 'url' or it's derived.
          // If not directly on model, this might need to be constructed. For now, assume it exists.
        },
      },
      media: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      // Assuming each Post can have its own reportedEntity relation
      // This is distinct from the reportedEntityId used in the where clause,
      // which refers to the entity whose profile page is being viewed.
      reportedEntity: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          handles: { select: { id: true, handle: true, platform: true } },
        },
      },
      // Add other includes like 'flags' if TPost requires them and they are relations
    },
    orderBy: {
      createdAt: "desc", // Example: default sort order
    },
  });

  // TODO: Temporary mapping to satisfy TPost more closely until Prisma types are fully aligned
  // or until we ensure all fields like author.name, space.url are directly available.
  // This mapping step might be removed if Prisma select/include directly matches TPost structure.
  return posts.map((rawPost) => {
    const post = redactAnonymousPost(
      withViewerPermissions(rawPost, userId, viewerRole)
    );
    const { authorId: _authorId, ...postWithoutAuthorId } = post;
    const author = post.isAnonymous
      ? { id: "anonymous", name: "Anonymous", username: "anonymous", role: "user" as const }
      : post.author
        ? {
            id: post.author.id,
            name: `${post.author.firstName} ${post.author.lastName}`.trim() || "Unknown User",
            username: post.author.instagram || "unknown",
            role: "user" as const,
          }
        : { id: "unknown", name: "Unknown User", username: "unknown", role: "user" as const };

    return {
    ...postWithoutAuthorId,
    // Ensure author structure matches AuthorProfile, especially if 'name' isn't direct.
    // Prisma's select will return null for relations if they don't exist, which is fine for optional TPost fields.
    author,

    content: post.description,
    media: toEvidenceMedia(post.media),
    status: post.status === "hidden"
      ? "hidden"
      : post.isAdminOnly
        ? "admin_only"
        : "published",
    currentUser: {
      id: userId,
      isSuperAdmin: user.isSuperAdmin,
      role: viewerRole === "ADMIN" || viewerRole === "SUPERADMIN"
        ? "admin"
        : viewerRole === "MODERATOR"
          ? "moderator"
          : "user",
    },

    // If space.url is not directly on the model and needs construction (e.g. /spaces/${id}):
    space: post.space
      ? { ...post.space, url: `/dashboard/spaces/${post.space.id}` }
      : undefined,

    // Ensure createdAt is a string
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt ? post.updatedAt.toISOString() : undefined,
  };
  }) as unknown as ReportedEntityPost[]; // Cast needed because the intermediate mapping might not perfectly match the defined (but soon to be updated) ReportedEntityPost
}
