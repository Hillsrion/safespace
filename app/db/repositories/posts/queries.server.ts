import { prisma } from "~/db/client.server";
import type { Post, PostStatus } from "~/generated/prisma";
import { getUserById } from "../users.server";

type GetUserPostsOptions = {
  status?: PostStatus;
  limit?: number;
  cursor?: string;
  includeHidden?: boolean;
};

type GetSpacePostsOptions = GetUserPostsOptions & {
  spaceId?: string;
};

export async function getUserPosts(
  userId: string,
  options: GetUserPostsOptions = {}
) {
  const {
    status = "active",
    limit = 20,
    cursor,
    includeHidden = false,
  } = options;

  return prisma.post.findMany({
    where: {
      authorId: userId,
      status: includeHidden ? undefined : status,
    },
    include: {
      reportedEntity: true,
      media: true,
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
  });
}

export async function getTotalPosts() {
  return prisma.post.count();
}

export async function getSpacePosts(
  userId: string,
  options: GetSpacePostsOptions = {}
) {
  const {
    status = "active",
    limit = 20,
    cursor,
    includeHidden = false,
    spaceId,
  } = options;

  // First, get all spaces the user is a member of
  const userSpaces = await prisma.userSpaceMembership.findMany({
    where: { userId },
    select: { spaceId: true },
  });

  const spaceIds = userSpaces.map((us: { spaceId: string }) => us.spaceId);

  if (spaceIds.length === 0) {
    return [];
  }

  return prisma.post.findMany({
    where: {
      spaceId: spaceId ? spaceId : { in: spaceIds },
      status: includeHidden ? undefined : status,
      OR: [
        { isAdminOnly: false }, // Public posts
        {
          isAdminOnly: true,
          space: {
            memberships: {
              some: {
                userId,
                role: { in: ["ADMIN", "MODERATOR"] },
              },
            },
          },
        }, // Admin-only posts in spaces where user is admin/moderator
      ],
    },
    include: {
      reportedEntity: true,
      media: true,
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      space: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
  });
}

// NOTE: This function is so critical that it should be protected by a super admin check
export async function getAllPosts(userId: string) {
  const user = await getUserById(userId, {
    isSuperAdmin: true,
  });
  if (user?.isSuperAdmin) {
    return prisma.post.findMany({
      include: {
        reportedEntity: true,
        media: true,
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        space: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  } else {
    return [];
  }
}
