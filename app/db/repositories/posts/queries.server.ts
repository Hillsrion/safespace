import { prisma } from "~/db/client.server";
import type { PostStatus, PrismaClient } from "~/generated/prisma";
import { errors } from "~/lib/api/http-error";
import { redactAnonymousPost } from "~/lib/post-privacy";
import {
  enqueueMediaDeletionJobs,
  processMediaDeletionJobs,
} from "~/services/media-deletion.server";
import type { MediaStorage } from "~/services/media-storage.server";
import { getEffectiveSpaceAccess } from "~/services/effective-space-access.server";

export { redactAnonymousPost } from "~/lib/post-privacy";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

export type ViewerRole =
  | "READ_ONLY"
  | "EDITOR"
  | "MODERATOR"
  | "ADMIN"
  | "SUPERADMIN"
  | null;

export type PostViewerPermissions = {
  /** Current viewer's normalized role in this post's space. */
  viewerRole: ViewerRole;
  /** Server-authorized edit capability; safe to use when authorId is redacted. */
  viewerCanEdit: boolean;
  /** Delete is reserved to Moderator/Admin/SuperAdmin. */
  viewerCanDelete: boolean;
  /** Hide/unhide is reserved to Moderator/Admin/SuperAdmin. */
  viewerCanModerate: boolean;
};

/**
 * Minimal, server-derived capabilities for a post viewer. These let clients
 * render actions for an anonymous author's own post without receiving the
 * anonymous author's identity.
 */
export function withViewerPermissions<
  T extends { authorId: string | null; spaceId: string },
>(
  post: T,
  viewerId: string,
  viewerRole: ViewerRole
): T & PostViewerPermissions {
  const viewerCanModerate =
    viewerRole === "MODERATOR" ||
    viewerRole === "ADMIN" ||
    viewerRole === "SUPERADMIN";
  const viewerCanEdit =
    viewerCanModerate ||
    (viewerRole === "EDITOR" && post.authorId === viewerId);

  return {
    ...post,
    viewerRole,
    viewerCanEdit,
    viewerCanDelete: viewerCanModerate,
    viewerCanModerate,
  };
}

type GetUserPostsOptions = {
  status?: PostStatus;
  limit?: number;
  cursor?: string | null;
  includeHidden?: boolean;
};

type GetSpacePostsOptions = GetUserPostsOptions & {
  spaceId?: string;
};

export function toCursorPage<T extends { id: string }>(
  items: T[],
  limit: number
) {
  const hasNextPage = items.length > limit;
  const pageItems = hasNextPage ? items.slice(0, limit) : items;

  return {
    posts: pageItems,
    nextCursor: hasNextPage ? pageItems.at(-1)?.id : undefined,
    hasNextPage,
  };
}

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
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          handles: { select: { id: true, handle: true, platform: true } },
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

  return toCursorPage(posts.map(redactAnonymousPost), actualLimit);
}

export async function getTotalPosts() {
  return prisma.post.count();
}

export async function getSpacePosts(
  userId: string,
  options: GetSpacePostsOptions = {},
  client: PrismaClient = prisma
) {
  const {
    status = "active",
    limit = 20,
    cursor,
    includeHidden = false,
    spaceId,
  } = options;

  // First, get all spaces the user is a member of
  const userSpaces = await client.userSpaceMembership.findMany({
    where: { userId },
    select: { spaceId: true, role: true },
  });

  const effectiveMemberships = await Promise.all(
    userSpaces.map(async (membership) => ({
      spaceId: membership.spaceId,
      access: await getEffectiveSpaceAccess(client, userId, membership.spaceId),
    }))
  );
  const accessibleMemberships = effectiveMemberships.filter(
    ({ access }) => access.role !== null
  );
  const spaceIds = accessibleMemberships.map(({ spaceId }) => spaceId);
  const rolesBySpace = new Map(
    accessibleMemberships.map(({ spaceId, access }) => [
      spaceId,
      access.role,
    ])
  );
  const elevatedSpaceIds = accessibleMemberships
    .filter(({ access }) => access.role === "ADMIN" || access.role === "MODERATOR")
    .map(({ spaceId }) => spaceId);

  if (spaceIds.length === 0 || (spaceId && !spaceIds.includes(spaceId))) {
    return { posts: [], nextCursor: undefined, hasNextPage: false };
  }

  const actualLimit = limit;

  const posts = await client.post.findMany({
    where: {
      spaceId: spaceId ? spaceId : { in: spaceIds },
      status: includeHidden ? undefined : status,
      OR: [
        { isAdminOnly: false }, // Public posts
        {
          isAdminOnly: true,
          spaceId: { in: elevatedSpaceIds },
        }, // Admin-only posts in spaces where user is admin/moderator
      ],
    },
    include: {
      reportedEntity: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          handles: { select: { id: true, handle: true, platform: true } },
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

  const safePosts = posts.map((post) =>
    redactAnonymousPost(
      withViewerPermissions(
        post,
        userId,
        rolesBySpace.get(post.spaceId) ?? null
      )
    )
  );

  return toCursorPage(safePosts, actualLimit);
}

// NOTE: This function is so critical that it should be protected by a super admin check
export async function getAllPosts(
  userId: string,
  options: { limit?: number; cursor?: string; spaceId?: string } = {},
  client: PrismaClient = prisma
) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });

  if (!user?.isSuperAdmin) {
    return { posts: [], nextCursor: undefined, hasNextPage: false };
  }

  const { limit = 20, cursor, spaceId } = options;
  const actualLimit = limit;

  const posts = await client.post.findMany({
    where: spaceId ? { spaceId } : undefined,
    include: {
      reportedEntity: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          handles: { select: { id: true, handle: true, platform: true } },
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

  return toCursorPage(
    posts.map((post) =>
      redactAnonymousPost(
        withViewerPermissions(post, userId, "SUPERADMIN")
      )
    ),
    actualLimit
  );
}

export function normalizeViewerRole(role: string | undefined): ViewerRole {
  const normalized = role?.trim().toUpperCase().replaceAll("-", "_");
  return normalized === "READ_ONLY" ||
    normalized === "EDITOR" ||
    normalized === "MODERATOR" ||
    normalized === "ADMIN"
    ? normalized
    : null;
}

async function getCurrentSpaceAccess(
  tx: TransactionClient,
  actorId: string,
  spaceId: string
) {
  const access = await getEffectiveSpaceAccess(tx, actorId, spaceId);
  return { isSuperAdmin: access.isSuperAdmin, role: access.role };
}

/** Delete and its audit record either both commit or both roll back. */
export async function deletePost(
  postId: string,
  actorId: string,
  client: PrismaClient = prisma,
  options: { storage?: MediaStorage } = {}
) {
  const outcome = await client.$transaction(
    async (tx) => {
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: {
          id: true,
          spaceId: true,
          authorId: true,
          isAnonymous: true,
          isAdminOnly: true,
          media: { select: { storageKey: true } },
        },
      });
      if (!post) throw errors.notFound("Post not found");

      const access = await getCurrentSpaceAccess(tx, actorId, post.spaceId);
      const isModerator =
        access.role === "ADMIN" || access.role === "MODERATOR";
      const mayDelete = access.isSuperAdmin || isModerator;

      if (!mayDelete) {
        // Do not disclose cross-space post existence to unrelated users. A
        // removed author still gets a useful forbidden response for their own
        // formerly-authored post.
        if (
          post.authorId !== actorId &&
          access.role === null &&
          !access.isSuperAdmin
        ) {
          throw errors.notFound("Post not found");
        }
        throw errors.forbidden("You do not have permission to delete this post");
      }

      const storageKeys = await enqueueMediaDeletionJobs(
        tx,
        (post.media ?? []).map(({ storageKey }) => storageKey),
        { requestedByUserId: actorId, spaceId: post.spaceId }
      );
      await tx.post.delete({ where: { id: post.id } });
      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          action: "post_delete",
          targetEntityType: "Post",
          targetEntityId: post.id,
          spaceId: post.spaceId,
          details: {
            isAnonymous: post.isAnonymous,
            isAdminOnly: post.isAdminOnly,
          },
        },
      });

      return { post, storageKeys };
    },
    { isolationLevel: "Serializable" }
  );
  await processMediaDeletionJobs(outcome.storageKeys, {
    client,
    storage: options.storage,
  });
  return outcome.post;
}

/** Revalidate the moderator role and audit the status change atomically. */
export async function updatePostStatus(
  postId: string,
  status: "active" | "hidden",
  actorId: string,
  client: PrismaClient = prisma
) {
  return client.$transaction(
    async (tx) => {
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: { id: true, spaceId: true, status: true },
      });
      if (!post) throw errors.notFound("Post not found");

      const access = await getCurrentSpaceAccess(tx, actorId, post.spaceId);
      if (
        !access.isSuperAdmin &&
        access.role !== "ADMIN" &&
        access.role !== "MODERATOR"
      ) {
        if (access.role === null) throw errors.notFound("Post not found");
        throw errors.forbidden("You do not have permission to moderate this post");
      }

      const updated = await tx.post.update({
        where: { id: post.id },
        data: { status },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actorId,
          action: "post_update",
          targetEntityType: "Post",
          targetEntityId: post.id,
          spaceId: post.spaceId,
          details: {
            changedFields: ["status"],
            previousStatus: post.status,
            status,
          },
        },
      });

      return updated;
    },
    { isolationLevel: "Serializable" }
  );
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
