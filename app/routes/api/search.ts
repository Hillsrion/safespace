import { data, type LoaderFunctionArgs } from "react-router";
import { prisma } from "~/db/client.server";
import { requireUser } from "~/services/auth.server";
import { HttpError, errors } from "~/lib/api/http-error";
import { redactAnonymousPost } from "~/lib/post-privacy";
import { advancedSearchQuerySchema } from "~/lib/search";

const SEARCH_RESULT_LIMIT = 20;

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

/**
 * A supplied space filter is an authorization boundary, not just a query
 * preference. Returning a 403 for a non-member avoids treating search as a
 * cross-space existence oracle and keeps saved searches safe after a member
 * leaves a space.
 */
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
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);
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

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const filters = parseSearchQuery(request);

  try {
    await assertSearchSpaceAccess(user, filters.spaceId);
    const { postAccess, entityAccess } = getSearchAccessFilters(user);

    const posts =
      filters.type === "entities"
        ? []
        : await prisma.post.findMany({
            where: {
              ...postAccess,
              ...(filters.spaceId ? { spaceId: filters.spaceId } : {}),
              ...(filters.severity ? { severity: filters.severity } : {}),
              ...(filters.verification
                ? { verificationStatus: filters.verification }
                : {}),
              description: {
                contains: filters.q,
                mode: "insensitive",
              },
            },
            include: {
              reportedEntity: {
                select: {
                  id: true,
                  name: true,
                  createdAt: true,
                  updatedAt: true,
                  handles: {
                    select: { id: true, handle: true, platform: true },
                  },
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: SEARCH_RESULT_LIMIT,
          });

    const reportedEntities =
      filters.type === "posts"
        ? []
        : await prisma.reportedEntity.findMany({
            where: {
              ...entityAccess,
              ...(filters.spaceId ? { spaceId: filters.spaceId } : {}),
              OR: [
                { name: { contains: filters.q, mode: "insensitive" } },
                {
                  handles: {
                    some: {
                      handle: { contains: filters.q, mode: "insensitive" },
                    },
                  },
                },
              ],
            },
            select: {
              id: true,
              name: true,
              createdAt: true,
              updatedAt: true,
              handles: { select: { id: true, handle: true, platform: true } },
            },
            orderBy: { updatedAt: "desc" },
            take: SEARCH_RESULT_LIMIT,
          });

    return data(toSearchResults(posts, reportedEntities));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("Search error:", error);
    throw errors.internalServerError("Search failed");
  }
}
