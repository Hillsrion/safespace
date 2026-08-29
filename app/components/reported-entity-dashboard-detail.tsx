import {
  Link,
  useLoaderData,
  useRouteError,
  isRouteErrorResponse,
} from "react-router";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Post as PostComponent } from "~/components/post";
import { REPORTED_ENTITY_MEMBER_MAX_PAGE } from "~/lib/reported-entity-member";
import type { TPost } from "~/lib/types";

export type ReportedEntityDashboardData = {
  entity: {
    id: string;
    name: string;
    handles: Array<{ id: string; handle: string; platform: string }>;
  };
  posts: TPost[];
  page: number;
  totalPages: number;
  totalPosts: number;
};

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
  const { entity, posts, page, totalPages, totalPosts } =
    useLoaderData<ReportedEntityDashboardData>();

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
