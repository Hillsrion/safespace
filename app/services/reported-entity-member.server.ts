import { prisma } from "~/db/client.server";
import type { PrismaClient } from "~/generated/prisma";
import type { ReportedEntityMemberPageQuery } from "~/lib/reported-entity-member";
import { errors } from "~/lib/api/http-error";
import {
  getEffectiveSpaceAccess,
  type EffectiveSpaceAccess,
} from "~/services/effective-space-access.server";
import {
  getSpacePostVisibilityWhere,
  toSafeSpacePost,
} from "~/services/space-post-visibility.server";

type MemberReadClient = Pick<
  PrismaClient,
  | "user"
  | "userSpaceMembership"
  | "disciplinaryAction"
  | "reportedEntity"
  | "post"
>;

const PUBLIC_HANDLE_SELECT = {
  id: true,
  handle: true,
  platform: true,
} as const;

const PUBLIC_POST_INCLUDE = {
  author: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      instagram: true,
    },
  },
  space: { select: { id: true, name: true } },
  reportedEntity: {
    select: {
      id: true,
      name: true,
      handles: { select: PUBLIC_HANDLE_SELECT },
    },
  },
  media: {
    select: {
      id: true,
      mimeType: true,
      fileSize: true,
      metadataStripped: true,
      isBlurred: true,
      evidenceCategory: true,
      caption: true,
      sortOrder: true,
      createdAt: true,
    },
    orderBy: [
      { sortOrder: "asc" as const },
      { id: "asc" as const },
    ] as Array<{ sortOrder?: "asc"; id?: "asc" }>,
  },
} as const;

type PublicEntityRow = {
  id: string;
  spaceId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  handles: Array<{
    id: string;
    handle: string;
    platform: string;
  }>;
  _count: { posts: number };
};

function toPublicEntity(row: PublicEntityRow) {
  return {
    id: row.id,
    spaceId: row.spaceId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    handles: row.handles.map(({ id, handle, platform }) => ({
      id,
      handle,
      platform,
    })),
    postCount: row._count.posts,
  };
}

async function requireEffectiveMember(
  client: MemberReadClient,
  userId: string,
  spaceId: string,
  missingMessage: string
): Promise<EffectiveSpaceAccess> {
  const access = await getEffectiveSpaceAccess(client, userId, spaceId);
  if (!access.isSuperAdmin && access.role === null) {
    // A missing, removed or suspended membership is indistinguishable from a
    // missing private resource to prevent space enumeration.
    throw errors.notFound(missingMessage);
  }
  return access;
}

function visiblePostsFor(
  userId: string,
  spaceId: string,
  access: EffectiveSpaceAccess
) {
  return {
    spaceId,
    ...getSpacePostVisibilityWhere(userId, access),
  };
}

/** List entities in one effective membership, with visible-report counts only. */
export async function listReportedEntitiesForMember(
  userId: string,
  spaceId: string,
  query: ReportedEntityMemberPageQuery,
  client: MemberReadClient = prisma
) {
  const access = await requireEffectiveMember(
    client,
    userId,
    spaceId,
    "Space not found"
  );
  const visiblePosts = visiblePostsFor(userId, spaceId, access);
  const where = { spaceId };
  const [rows, total] = await Promise.all([
    client.reportedEntity.findMany({
      where,
      select: {
        id: true,
        spaceId: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        handles: {
          select: PUBLIC_HANDLE_SELECT,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        _count: { select: { posts: { where: visiblePosts } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    client.reportedEntity.count({ where }),
  ]);

  return {
    entities: rows.map((row) => toPublicEntity(row as PublicEntityRow)),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.ceil(total / query.limit),
  };
}

/** Get one explicitly scoped entity and its currently visible report page. */
export async function getReportedEntityForMember(
  userId: string,
  spaceId: string,
  entityId: string,
  query: ReportedEntityMemberPageQuery,
  client: MemberReadClient = prisma
) {
  const access = await requireEffectiveMember(
    client,
    userId,
    spaceId,
    "Reported entity not found"
  );
  const visiblePosts = visiblePostsFor(userId, spaceId, access);
  const postWhere = {
    reportedEntityId: entityId,
    ...visiblePosts,
  };
  const entity = await client.reportedEntity.findFirst({
    where: { id: entityId, spaceId },
    select: {
      id: true,
      spaceId: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      handles: {
        select: PUBLIC_HANDLE_SELECT,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      _count: { select: { posts: { where: postWhere } } },
    },
  });
  if (!entity) throw errors.notFound("Reported entity not found");

  const posts = await client.post.findMany({
    where: postWhere,
    include: PUBLIC_POST_INCLUDE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  });
  const publicEntity = toPublicEntity(entity as PublicEntityRow);

  return {
    entity: publicEntity,
    posts: posts.map((post) => toSafeSpacePost(post, userId, access)),
    page: query.page,
    limit: query.limit,
    totalPosts: publicEntity.postCount,
    totalPages: Math.ceil(publicEntity.postCount / query.limit),
  };
}
