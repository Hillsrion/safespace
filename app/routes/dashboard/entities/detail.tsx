import { data, redirect, type LoaderFunctionArgs } from "react-router";
import { z } from "zod";

import ReportedEntityPage, {
  ErrorBoundary,
} from "~/components/reported-entity-dashboard-detail";
import { toEvidenceMedia } from "~/lib/evidence";
import { HttpError } from "~/lib/api/http-error";
import { logServerException } from "~/lib/error/server-error.server";
import { reportedEntityMemberPageQuerySchema } from "~/lib/reported-entity-member";
import type { TPost } from "~/lib/types";
import { requireUser } from "~/services/auth.server";
import { getReportedEntityForMemberById } from "~/services/reported-entity-member.server";
import { trackVisitedSpace } from "~/services/space-activity-tracking.server";

const ENTITY_POSTS_PAGE_LIMIT = 20;

function parseEntityPage(request: Request) {
  const url = new URL(request.url);
  const pages = url.searchParams.getAll("page");
  if (pages.length > 1) {
    throw new Response("Invalid reported entity page.", { status: 400 });
  }

  const parsed = reportedEntityMemberPageQuerySchema.safeParse({
    page: pages[0],
    limit: ENTITY_POSTS_PAGE_LIMIT,
  });
  if (!parsed.success) {
    throw new Response("Invalid reported entity page.", { status: 400 });
  }
  return parsed.data;
}

function toPostCard(
  post: Awaited<ReturnType<typeof getReportedEntityForMemberById>>["posts"][number],
  userId: string
): TPost {
  const viewerRole = post.viewerRole;
  const currentUserRole = viewerRole === "ADMIN" || viewerRole === "SUPERADMIN"
    ? "admin"
    : viewerRole === "MODERATOR"
      ? "moderator"
      : "user";
  const author = post.author
    ? {
        id: post.author.id,
        name: [post.author.firstName, post.author.lastName].filter(Boolean).join(" ") || "Utilisateur inconnu",
        username: post.author.instagram ?? "inconnu",
        role: null,
      }
    : {
        id: "unknown",
        name: "Utilisateur inconnu",
        username: "inconnu",
        role: null,
      };

  return {
    id: post.id,
    author,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    content: post.description ?? "",
    media: toEvidenceMedia(post.media),
    status: post.status === "hidden"
      ? "hidden"
      : post.isAdminOnly
        ? "admin_only"
        : "published",
    severity: post.severity,
    verificationStatus: post.verificationStatus,
    requiresSensitiveReview: post.requiresSensitiveReview,
    reportedEntity: post.reportedEntity as TPost["reportedEntity"],
    space: post.space
      ? {
          id: post.space.id,
          name: post.space.name,
          url: `/dashboard/spaces/${encodeURIComponent(post.space.id)}`,
        }
      : undefined,
    currentUser: { id: userId, role: currentUserRole },
    viewerCanEdit: post.viewerCanEdit,
    viewerCanDelete: post.viewerCanDelete,
    viewerCanModerate: post.viewerCanModerate,
  };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const parsedEntityId = z.string().uuid().safeParse(params.id);
  if (!parsedEntityId.success) {
    throw new Response("Reported Entity ID is invalid.", { status: 400 });
  }

  try {
    const user = await requireUser(request);
    const query = parseEntityPage(request);
    const result = await getReportedEntityForMemberById(
      user.id,
      parsedEntityId.data,
      query
    );
    const totalPages = Math.max(1, result.totalPages);
    if (query.page > totalPages) {
      return redirect(`/dashboard/entities/${parsedEntityId.data}?page=${totalPages}`);
    }
    await trackVisitedSpace(user.id, result.entity.spaceId);

    return data({
      ...result,
      totalPages,
      posts: result.posts.map((post) => toPostCard(post, user.id)),
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error instanceof HttpError) throw error.toResponse();

    logServerException(error, {
      operation: "database.query",
      errorCode: "server_error:api",
      httpStatus: 500,
    });
    throw new Response("Error loading reported entity page.", { status: 500 });
  }
}

export { ErrorBoundary };
export default ReportedEntityPage;
