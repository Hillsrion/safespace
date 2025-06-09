import { prisma } from "~/db/client.server";
import type { ReportedEntityWithHandles, ReportedEntityPost } from "./types";

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
    include: {
      handles: true, // Assuming 'handles' is a relation on the ReportedEntity model
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
  userId: string
): Promise<ReportedEntityPost[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        // Assuming 'spaceMemberships' is the relation name on the User model
        select: { spaceId: true },
      },
    },
  });

  if (!user) {
    // Or handle this case as per your application's error handling strategy
    throw new Error("User not found");
  }

  const userSpaceIds = user.memberships.map((sm) => sm.spaceId);

  // Base conditions for fetching posts related to the ReportedEntity
  const whereConditions: any = {
    reportedEntityId: reportedEntityId,
  };

  if (!user.isSuperAdmin) {
    whereConditions.OR = [
      // User's own posts
      { userId: userId },
      // Posts in spaces the user is a member of
      { spaceId: { in: userSpaceIds } },
    ];
  }
  // SuperAdmins can see all posts for the reported entity, so no additional OR conditions are needed.

  const posts = await prisma.post.findMany({
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
      media: true, // Assuming relation name is 'media' and it fetches all EvidenceMedia fields
      // Assuming each Post can have its own reportedEntity relation
      // This is distinct from the reportedEntityId used in the where clause,
      // which refers to the entity whose profile page is being viewed.
      reportedEntity: {
        include: {
          handles: true, // To match TPost's ReportedEntity, which includes handles
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
  return posts.map((post) => ({
    ...post,
    // Ensure author structure matches AuthorProfile, especially if 'name' isn't direct.
    // Prisma's select will return null for relations if they don't exist, which is fine for optional TPost fields.
    author: post.author
      ? {
          ...post.author,
          name: post.author.firstName || post.author.lastName || "Unknown User", // Fallback for name
          role: "user", // Fallback for role
        }
      : { id: "unknown", name: "Unknown User", role: "user" }, // Placeholder for missing author

    // If space.url is not directly on the model and needs construction (e.g. /spaces/${id}):
    // space: post.space ? { ...post.space, url: `/spaces/${post.space.id}` } : undefined,

    // Ensure createdAt is a string
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt ? post.updatedAt.toISOString() : undefined,
  })) as unknown as ReportedEntityPost[]; // Cast needed because the intermediate mapping might not perfectly match the defined (but soon to be updated) ReportedEntityPost
}
