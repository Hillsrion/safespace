import { Search } from "lucide-react";
import type { Prisma } from "~/generated/prisma";
import {
  Form,
  Link,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { prisma } from "~/db/client.server";
import { getCurrentUser } from "~/services/auth.server";
import { getUserSpaces } from "~/db/repositories/spaces/queries.server";
import {
  CreateReportedEntityControl,
  ReportedEntityAdminActions,
} from "~/components/reported-entity-admin-controls";

export const handle = { crumb: "Entités signalées" };

const PAGE_SIZE = 25;
const SEVERITIES = ["low", "medium", "high"] as const;
const VERIFICATION_STATUSES = ["unverified", "pending", "verified", "disputed"] as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  if (!user) throw redirect("/auth/login");

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const severity = SEVERITIES.find((value) => value === url.searchParams.get("severity"));
  const verification = VERIFICATION_STATUSES.find(
    (value) => value === url.searchParams.get("verification")
  );
  const requestedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), 100)
    : 1;
  // `getUserSpaces` re-checks effective access, including active discipline.
  // Do not base dashboard visibility on a raw membership relation.
  const spaces = await getUserSpaces(user.id);
  const accessibleSpaceIds = spaces.map(({ id }) => id);
  const elevatedSpaceIds = spaces
    .filter(({ role }) => ["ADMIN", "MODERATOR"].includes(role.trim().toUpperCase()))
    .map(({ id }) => id);
  const membershipFilter = user.isSuperAdmin
    ? {}
    : { spaceId: { in: accessibleSpaceIds } };
  const searchFilter = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          {
            handles: {
              some: { handle: { contains: query, mode: "insensitive" as const } },
            },
          },
        ],
      }
    : {};
  let where: Prisma.ReportedEntityWhereInput = { ...membershipFilter, ...searchFilter };
  const visiblePostFilter = user.isSuperAdmin
    ? {}
    : {
        status: "active" as const,
        OR: [
          { isAdminOnly: false },
          {
            isAdminOnly: true,
            spaceId: { in: elevatedSpaceIds },
          },
        ],
      };
  const postSummaryFilter = {
    AND: [
      visiblePostFilter,
      ...(severity ? [{ severity }] : []),
      ...(verification ? [{ verificationStatus: verification }] : []),
    ],
  };
  if (severity || verification) {
    where = { ...where, posts: { some: postSummaryFilter } };
  }

  const manageableSpaces = spaces.filter(({ role }) => {
    const normalized = role.trim().toUpperCase();
    return user.isSuperAdmin || normalized === "ADMIN";
  });
  const manageableSpaceIds = new Set(manageableSpaces.map(({ id }) => id));

  const [entities, total] = await Promise.all([
    prisma.reportedEntity.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        space: { select: { id: true, name: true } },
        handles: {
          orderBy: { createdAt: "asc" },
          take: 5,
          select: { id: true, handle: true, platform: true },
        },
        _count: { select: { posts: { where: postSummaryFilter } } },
        posts: {
          where: postSummaryFilter,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { createdAt: true, severity: true, verificationStatus: true },
        },
      },
    }),
    prisma.reportedEntity.count({ where }),
  ]);

  // Review notes are administrative data. Keep them out of the serialized
  // loader payload for handles belonging to spaces the viewer cannot manage.
  const manageableHandleIds = entities
    .filter((entity) => manageableSpaceIds.has(entity.space.id))
    .flatMap((entity) => entity.handles.map(({ id }) => id));
  const reviewRows = manageableHandleIds.length > 0
    ? await prisma.reportedEntityHandle.findMany({
        where: { id: { in: manageableHandleIds } },
        select: {
          id: true,
          reviewStatus: true,
          reviewNote: true,
          reviewedAt: true,
        },
      })
    : [];
  const handleReviews = Object.fromEntries(
    reviewRows.map(({ id, ...review }) => [id, review])
  );

  return {
    entities,
    handleReviews,
    page,
    query,
    severity: severity ?? "",
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    verification: verification ?? "",
    manageableSpaces,
  };
}

export default function ReportedEntitiesPage() {
  const { entities, handleReviews, manageableSpaces, page, query, severity, total, totalPages, verification } = useLoaderData<typeof loader>();
  const manageableSpaceIds = new Set(manageableSpaces.map(({ id }) => id));
  const pageUrl = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (severity) params.set("severity", severity);
    if (verification) params.set("verification", verification);
    params.set("page", String(targetPage));
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Entités signalées</h1>
          <p className="text-sm text-muted-foreground">
            {total} résultat{total === 1 ? "" : "s"} dans vos espaces accessibles.
          </p>
        </div>
        <CreateReportedEntityControl spaces={manageableSpaces} />
      </div>

      <Card>
        <CardHeader><CardTitle>Rechercher</CardTitle></CardHeader>
        <CardContent>
          <Form method="get" className="grid gap-2 md:grid-cols-[1fr_180px_180px_auto]">
            <Input
              aria-label="Nom ou identifiant Instagram"
              defaultValue={query}
              maxLength={100}
              name="q"
              placeholder="Nom ou @identifiant"
            />
            <select aria-label="Sévérité du rapport" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" defaultValue={severity} name="severity">
              <option value="">Toutes sévérités</option>
              <option value="low">Faible</option>
              <option value="medium">Moyenne</option>
              <option value="high">Élevée</option>
            </select>
            <select aria-label="Statut de vérification" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" defaultValue={verification} name="verification">
              <option value="">Toutes vérifications</option>
              <option value="unverified">Non vérifié</option>
              <option value="pending">En attente</option>
              <option value="verified">Vérifié</option>
              <option value="disputed">Contesté</option>
            </select>
            <Button type="submit"><Search className="mr-2 h-4 w-4" />Rechercher</Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <p className="mb-3 text-sm text-muted-foreground">Les résumés et le nombre de rapports concernent uniquement les rapports visibles correspondant aux filtres. La sévérité et la vérification sont celles du dernier rapport correspondant.</p>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nom</TableHead><TableHead>Handles</TableHead><TableHead>Espace</TableHead><TableHead>Ajoutée le</TableHead><TableHead>Dernier rapport</TableHead><TableHead>Sévérité</TableHead><TableHead>Vérification</TableHead><TableHead>Rapports</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {entities.map((entity) => (
                <TableRow key={entity.id}>
                  <TableCell className="font-medium">{entity.name}</TableCell>
                  <TableCell>{entity.handles.map(({ handle }) => `@${handle}`).join(", ") || "—"}</TableCell>
                  <TableCell>{entity.space.name}</TableCell>
                  <TableCell>{new Date(entity.createdAt).toLocaleDateString("fr-FR")}</TableCell>
                  <TableCell>{entity.posts[0] ? new Date(entity.posts[0].createdAt).toLocaleDateString("fr-FR") : "—"}</TableCell>
                  <TableCell>{entity.posts[0]?.severity ?? "—"}</TableCell>
                  <TableCell>{entity.posts[0]?.verificationStatus ?? "—"}</TableCell>
                  <TableCell>{entity._count.posts}</TableCell>
                  <TableCell className="space-y-2 text-right">
                    <Button asChild size="sm" variant="outline"><Link to={`/dashboard/entities/${entity.id}`}>Consulter</Link></Button>
                    {manageableSpaceIds.has(entity.space.id) && (
                      <ReportedEntityAdminActions
                        entity={{
                          id: entity.id,
                          name: entity.name,
                          spaceId: entity.space.id,
                          handles: entity.handles.map((handle) => ({
                            ...handle,
                            reviewStatus: handleReviews[handle.id]?.reviewStatus ?? "unreviewed",
                            reviewNote: handleReviews[handle.id]?.reviewNote ?? null,
                            reviewedAt: handleReviews[handle.id]?.reviewedAt ?? null,
                          })),
                          postCount: entity._count.posts,
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {entities.length === 0 && (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Aucune entité trouvée.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link aria-disabled={page <= 1} to={pageUrl(Math.max(1, page - 1))}>Précédent</Link>
            </Button>
            <span className="text-sm text-muted-foreground">Page {page} sur {totalPages}</span>
            <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
              <Link aria-disabled={page >= totalPages} to={pageUrl(Math.min(totalPages, page + 1))}>Suivant</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
