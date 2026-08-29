import { data, redirect, type LoaderFunctionArgs } from "react-router";
import {
  Link,
  useLoaderData,
  useRouteError,
  isRouteErrorResponse,
} from "react-router";
import { z } from "zod";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Post as PostComponent } from "~/components/post";
import { toEvidenceMedia } from "~/lib/evidence";
import { HttpError } from "~/lib/api/http-error";
import { logServerException } from "~/lib/error/server-error.server";
import {
  REPORTED_ENTITY_MEMBER_MAX_PAGE,
  reportedEntityMemberPageQuerySchema,
} from "~/lib/reported-entity-member";
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
    // The member DTO intentionally excludes entity lifecycle metadata; the
    // card only needs its public identity and handles.
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

export function EntityPostsPagination({
  entityId,
  page,
  totalPages,
}: {
  entityId: string;
  page: number;
  totalPages: number;
}) {
  const boundedTotalPages = Math.max(1, Math.min(totalPages, REPORTED_ENTITY_MEMBER_MAX_PAGE));
  const pageUrl = (targetPage: number) => `/dashboard/entities/${entityId}?page=${targetPage}`;
  const hasPrevious = page > 1;
  const hasNext = page < boundedTotalPages;

  return (
    <nav aria-label="Pagination des signalements" className="mt-6 flex items-center justify-between gap-3">
      <Button asChild variant="outline" disabled={!hasPrevious}>
        <Link aria-disabled={!hasPrevious} to={pageUrl(Math.max(1, page - 1))}>Précédent</Link>
      </Button>
      <span className="text-sm text-muted-foreground">Page {page} sur {boundedTotalPages}</span>
      <Button asChild variant="outline" disabled={!hasNext}>
        <Link aria-disabled={!hasNext} to={pageUrl(Math.min(boundedTotalPages, page + 1))}>Suivant</Link>
      </Button>
    </nav>
  );
}

export default function ReportedEntityPage() {
  const { entity, posts, page, totalPages, totalPosts } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-2xl font-bold md:text-3xl">
            {entity.name || "Détail de l’entité"}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500">
            {entity.handles.length} identifiant{entity.handles.length === 1 ? "" : "s"} connu{entity.handles.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <h3 className="mb-2 text-lg font-semibold text-gray-700">Identifiants :</h3>
          {entity.handles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {entity.handles.map((handle) => (
                <Badge key={handle.id} variant="secondary">
                  {handle.platform ? `${handle.platform}: ${handle.handle}` : handle.handle}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="italic text-gray-500">Aucun identifiant associé.</p>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-1 text-xl font-semibold text-gray-800">Signalements associés</h2>
        <p className="mb-4 text-sm text-muted-foreground">{totalPosts} signalement{totalPosts === 1 ? "" : "s"} accessible{totalPosts === 1 ? "" : "s"}</p>
        {posts.length > 0 ? (
          <div className="space-y-6">
            {posts.map((post) => <PostComponent key={post.id} {...post} />)}
          </div>
        ) : (
          <p className="py-4 text-center italic text-gray-500">
            Aucun signalement accessible pour cette entité.
          </p>
        )}
        <EntityPostsPagination entityId={entity.id} page={page} totalPages={totalPages} />
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <Card className="border-red-500 bg-red-50">
        <CardHeader><CardTitle className="text-xl font-bold text-red-700">Erreur</CardTitle></CardHeader>
        <CardContent className="text-red-600">
          {isRouteErrorResponse(error) ? (
            <p>{error.status === 404 ? "La ressource demandée est introuvable." : "La requête n’a pas pu aboutir."}</p>
          ) : <p>Une erreur inattendue est survenue.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
