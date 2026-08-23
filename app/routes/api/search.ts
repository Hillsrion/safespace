import { data, type LoaderFunctionArgs } from "react-router";
import { prisma } from "~/db/client.server";
import { requireUser } from "~/services/auth.server";
import { errors } from "~/lib/api/http-error";
import { redactAnonymousPost } from "~/lib/post-privacy";

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

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 2 || q.length > 100) {
    throw errors.badRequest("Search query must contain between 2 and 100 characters");
  }

  try {
    const { postAccess, entityAccess } = getSearchAccessFilters(user);

    const posts = await prisma.post.findMany({
      where: {
        ...postAccess,
        description: {
          contains: q,
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
            handles: { select: { id: true, handle: true, platform: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: SEARCH_RESULT_LIMIT,
    });

    const reportedEntities = await prisma.reportedEntity.findMany({
      where: {
        ...entityAccess,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { handles: { some: { handle: { contains: q, mode: "insensitive" } } } },
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

    // User search removed as per requirements

    return data(toSearchResults(posts, reportedEntities));
  } catch (error) {
    console.error("Search error:", error);
    throw errors.internalServerError("Search failed");
  }
}
