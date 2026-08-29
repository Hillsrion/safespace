import { data, type LoaderFunctionArgs } from "react-router";

import { prisma } from "~/db/client.server";
import { Prisma } from "~/generated/prisma";
import { HttpError, errors } from "~/lib/api/http-error";
import { parseUniqueSearchParams } from "~/lib/api/query-params";
import { redactAnonymousPost } from "~/lib/post-privacy";
import { advancedSearchQuerySchema } from "~/lib/search";
import { requireUser } from "~/services/auth.server";

const SEARCH_RESULT_LIMIT = 20;

type SearchPostRow = {
  id: string;
  description: string;
  isAnonymous: boolean;
  isAdminOnly: boolean;
  status: string;
  severity: string | null;
  verificationStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
  entityId: string;
  entityName: string;
  entityCreatedAt: Date;
  entityUpdatedAt: Date;
  entityHandles: Array<{ id: string; handle: string; platform: string }>;
};

type SearchEntityRow = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  handles: Array<{ id: string; handle: string; platform: string }>;
};

type SearchScope = {
  accessibleSpaceIds: string[] | null;
  elevatedSpaceIds: string[] | null;
  isSuperAdmin: boolean;
};

export function toSearchResults<
  P extends { id: string; isAnonymous: boolean },
  E extends { id: string },
>(posts: P[], reportedEntities: E[]) {
  const results = [
    ...posts.map((post) => ({
      type: "post" as const,
      data: redactAnonymousPost(post),
    })),
    ...reportedEntities.map((entity) => ({
      type: "reportedEntity" as const,
      data: entity,
    })),
  ];

  return Array.from(
    new Map(
      results.map((item) => [`${item.type}-${item.data.id}`, item])
    ).values()
  );
}

export function getSearchAccessFilters(user: {
  id: string;
  isSuperAdmin: boolean;
}) {
  return {
    postAccess: user.isSuperAdmin
      ? {}
      : {
          space: { memberships: { some: { userId: user.id } } },
          status: "active" as const,
          OR: [
            { isAdminOnly: false },
            {
              isAdminOnly: true,
              space: {
                memberships: {
                  some: {
                    userId: user.id,
                    role: {
                      in: [
                        "ADMIN",
                        "MODERATOR",
                        "Admin",
                        "Moderator",
                        "admin",
                        "moderator",
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
    entityAccess: user.isSuperAdmin
      ? {}
      : { space: { memberships: { some: { userId: user.id } } } },
  };
}

/** Treat an explicit space filter as an authorization boundary. */
export async function assertSearchSpaceAccess(
  user: { id: string; isSuperAdmin: boolean },
  spaceId?: string
): Promise<void> {
  if (!spaceId || user.isSuperAdmin) return;

  const membership = await prisma.userSpaceMembership.findUnique({
    where: { userId_spaceId: { userId: user.id, spaceId } },
    select: { userId: true },
  });
  if (!membership) {
    throw errors.forbidden("You are not a member of the requested space");
  }
}

function parseSearchQuery(request: Request) {
  const params = parseUniqueSearchParams(request);
  if (params.q === undefined && params.query !== undefined) {
    params.q = params.query;
    delete params.query;
  }
  const parsed = advancedSearchQuerySchema.safeParse(params);
  if (!parsed.success) {
    throw errors.badRequest(
      "Invalid search query or filters",
      "bad_request:api",
      parsed.error.flatten()
    );
  }
  return parsed.data;
}

function spaceScopeSql(
  column: Prisma.Sql,
  accessibleSpaceIds: string[] | null
) {
  if (accessibleSpaceIds === null) return Prisma.empty;
  return Prisma.sql`AND ${column} IN (${Prisma.join(
    accessibleSpaceIds.map((spaceId) => Prisma.sql`${spaceId}::uuid`)
  )})`;
}

function postFilterSql(
  filters: ReturnType<typeof parseSearchQuery>,
  scope: SearchScope
) {
  return Prisma.sql`
    ${spaceScopeSql(Prisma.sql`post."spaceId"`, scope.accessibleSpaceIds)}
    ${
      scope.isSuperAdmin
        ? Prisma.empty
        : Prisma.sql`
            AND post.status::text = 'active'
            AND (
              post."isAdminOnly" = false
              ${
                scope.elevatedSpaceIds?.length
                  ? Prisma.sql`OR post."spaceId" IN (${Prisma.join(
                      scope.elevatedSpaceIds.map(
                        (spaceId) => Prisma.sql`${spaceId}::uuid`
                      )
                    )})`
                  : Prisma.empty
              }
            )
          `
    }
    ${filters.severity ? Prisma.sql`AND post.severity::text = ${filters.severity}` : Prisma.empty}
    ${filters.verification ? Prisma.sql`AND post."verificationStatus"::text = ${filters.verification}` : Prisma.empty}
  `;
}

async function resolveSearchScope(
  user: { id: string; isSuperAdmin: boolean },
  explicitSpaceId?: string
): Promise<SearchScope> {
  if (user.isSuperAdmin) {
    return {
      accessibleSpaceIds: explicitSpaceId ? [explicitSpaceId] : null,
      elevatedSpaceIds: null,
      isSuperAdmin: true,
    };
  }
  const memberships = await prisma.userSpaceMembership.findMany({
    where: { userId: user.id },
    select: { spaceId: true, role: true },
  });
  const accessibleSpaceIds = explicitSpaceId
    ? [explicitSpaceId]
    : memberships.map(({ spaceId }) => spaceId);
  const elevatedSpaceIds = memberships
    .filter(({ role }) =>
      ["ADMIN", "MODERATOR"].includes(
        role.trim().toUpperCase().replaceAll("-", "_")
      )
    )
    .map(({ spaceId }) => spaceId)
    .filter((spaceId) => accessibleSpaceIds.includes(spaceId));
  return { accessibleSpaceIds, elevatedSpaceIds, isSuperAdmin: false };
}

async function searchPosts(
  filters: ReturnType<typeof parseSearchQuery>,
  scope: SearchScope
) {
  if (filters.type === "entities" || scope.accessibleSpaceIds?.length === 0) return [];
  const rows = await prisma.$queryRaw<SearchPostRow[]>(Prisma.sql`
    SELECT
      post.id,
      post.description,
      post."isAnonymous",
      post."isAdminOnly",
      post.status::text AS status,
      post.severity::text AS severity,
      post."verificationStatus"::text AS "verificationStatus",
      post."createdAt",
      post."updatedAt",
      entity.id AS "entityId",
      entity.name AS "entityName",
      entity."createdAt" AS "entityCreatedAt",
      entity."updatedAt" AS "entityUpdatedAt",
      COALESCE(handles.items, '[]'::jsonb) AS "entityHandles"
    FROM "Post" post
    JOIN "ReportedEntity" entity ON entity.id = post."reportedEntityId"
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', handle.id,
          'handle', handle.handle,
          'platform', handle.platform
        ) ORDER BY handle."createdAt", handle.id
      ) AS items
      FROM "ReportedEntityHandle" handle
      WHERE handle."reportedEntityId" = entity.id
    ) handles ON true
    WHERE to_tsvector('simple', COALESCE(post.description, ''))
      @@ websearch_to_tsquery('simple', ${filters.q})
      ${postFilterSql(filters, scope)}
    ORDER BY post."createdAt" DESC, post.id DESC
    LIMIT ${SEARCH_RESULT_LIMIT}
  `);

  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    isAnonymous: row.isAnonymous,
    isAdminOnly: row.isAdminOnly,
    status: row.status,
    severity: row.severity,
    verificationStatus: row.verificationStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    reportedEntity: {
      id: row.entityId,
      name: row.entityName,
      createdAt: row.entityCreatedAt,
      updatedAt: row.entityUpdatedAt,
      handles: row.entityHandles,
    },
  }));
}

async function searchEntities(
  filters: ReturnType<typeof parseSearchQuery>,
  scope: SearchScope
) {
  if (filters.type === "posts" || scope.accessibleSpaceIds?.length === 0) return [];
  return prisma.$queryRaw<SearchEntityRow[]>(Prisma.sql`
    SELECT
      entity.id,
      entity.name,
      entity."createdAt",
      entity."updatedAt",
      COALESCE(handles.items, '[]'::jsonb) AS handles
    FROM "ReportedEntity" entity
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', handle.id,
          'handle', handle.handle,
          'platform', handle.platform
        ) ORDER BY handle."createdAt", handle.id
      ) AS items
      FROM "ReportedEntityHandle" handle
      WHERE handle."reportedEntityId" = entity.id
    ) handles ON true
    WHERE (
      to_tsvector('simple', COALESCE(entity.name, ''))
        @@ websearch_to_tsquery('simple', ${filters.q})
      OR EXISTS (
        SELECT 1
        FROM "ReportedEntityHandle" matching_handle
        WHERE matching_handle."reportedEntityId" = entity.id
          AND (
            to_tsvector('simple', COALESCE(matching_handle.handle, ''))
              @@ websearch_to_tsquery('simple', ${filters.q})
            OR lower(matching_handle.handle) LIKE '%' || lower(${filters.q}) || '%'
          )
      )
      OR lower(entity.name) LIKE '%' || lower(${filters.q}) || '%'
    )
    ${spaceScopeSql(Prisma.sql`entity."spaceId"`, scope.accessibleSpaceIds)}
    ORDER BY entity."updatedAt" DESC, entity.id DESC
    LIMIT ${SEARCH_RESULT_LIMIT}
  `);
}

export async function searchLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const filters = parseSearchQuery(request);

  try {
    await assertSearchSpaceAccess(user, filters.spaceId);
    const scope = await resolveSearchScope(
      user,
      filters.spaceId
    );
    // RLS is active for every raw statement; these run in separate contextual
    // transactions and still cannot cross the authenticated user's spaces.
    const [posts, reportedEntities] = await Promise.all([
      searchPosts(filters, scope),
      searchEntities(filters, scope),
    ]);

    return data(toSearchResults(posts, reportedEntities));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("Search error:", error);
    throw errors.internalServerError("Search failed");
  }
}
