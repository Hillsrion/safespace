import { prisma } from "~/db/client.server";
import type { PostStatus } from "~/generated/prisma";
import { getUserById } from "../users.server";

type GetUserPostsOptions = {
  status?: PostStatus;
  limit?: number;
  cursor?: string | null;
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

  const actualLimit = limit;

  const posts = await prisma.post.findMany({
    where: {
      authorId: userId,
      status: includeHidden ? undefined : status,
    },
    include: {
      reportedEntity: {
        include: {
          handles: true,
        },
      },
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
    take: actualLimit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
  });

  let hasNextPage = false;
  let nextCursor: string | undefined = undefined;

  if (posts.length > actualLimit) {
    hasNextPage = true;
    const nextItem = posts.pop();
    nextCursor = nextItem!.id;
  }

  return { posts, nextCursor, hasNextPage };
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
    return { posts: [], nextCursor: undefined, hasNextPage: false };
  }

  const actualLimit = limit;

  const posts = await prisma.post.findMany({
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
      reportedEntity: {
        include: {
          handles: true,
        },
      },
      media: true,
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          instagram: true,
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
    take: actualLimit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
  });

  let hasNextPage = false;
  let nextCursor: string | undefined = undefined;

  if (posts.length > actualLimit) {
    hasNextPage = true;
    const nextItem = posts.pop();
    nextCursor = nextItem!.id;
  }

  return { posts, nextCursor, hasNextPage };
}

// NOTE: This function is so critical that it should be protected by a super admin check
export async function getAllPosts(
  userId: string,
  options: { limit?: number; cursor?: string } = {}
) {
  const user = await getUserById(userId, {
    isSuperAdmin: true,
  });

  if (!user?.isSuperAdmin) {
    return { posts: [], nextCursor: undefined, hasNextPage: false };
  }

  const { limit = 20, cursor } = options;
  const actualLimit = limit;

  const posts = await prisma.post.findMany({
    include: {
      reportedEntity: {
        include: {
          handles: true,
        },
      },
      media: true,
      author: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          instagram: true,
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
    take: actualLimit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
  });

  let hasNextPage = false;
  let nextCursor: string | undefined = undefined;

  if (posts.length > actualLimit) {
    hasNextPage = true;
    const nextItem = posts.pop();
    nextCursor = nextItem!.id;
  }

  return { posts, nextCursor, hasNextPage };
}

export async function deletePost(postId: string) {
  return prisma.post.delete({
    where: { id: postId },
  });
}

export async function updatePostStatus(
  postId: string,
  status: "active" | "hidden"
) {
  return prisma.post.update({
    where: { id: postId },
    data: { status },
  });
}

export async function getPostWithSpace(postId: string) {
  return prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: true,
      space: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}
