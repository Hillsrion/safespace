import { data, type LoaderFunctionArgs } from "react-router";

import { prisma } from "~/db/client.server";
import { HttpError, errors } from "~/lib/api/http-error";
import { parseUniqueSearchParams } from "~/lib/api/query-params";
import { redactAnonymousPost } from "~/lib/post-privacy";
import { advancedSearchQuerySchema } from "~/lib/search";
import {
  buildEntitySearchQuery,
  buildPostSearchQuery,
  type SearchQueryScope,
} from "~/lib/search-query";
import { requireUser } from "~/services/auth.server";

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

type SearchScope = SearchQueryScope;

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
  const rows = await prisma.$queryRaw<SearchPostRow[]>(
    buildPostSearchQuery(filters, scope),
  );

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
  return prisma.$queryRaw<SearchEntityRow[]>(
    buildEntitySearchQuery(filters, scope),
  );
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
