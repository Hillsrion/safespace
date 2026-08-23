import { Search } from "lucide-react";
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

export const handle = { crumb: "Entités signalées" };

const PAGE_SIZE = 25;

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  if (!user) throw redirect("/auth/login");

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const requestedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), 100)
    : 1;
  const membershipFilter = user.isSuperAdmin
    ? {}
    : { space: { memberships: { some: { userId: user.id } } } };
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
  const where = { ...membershipFilter, ...searchFilter };
  const visiblePostFilter = user.isSuperAdmin
    ? {}
    : {
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
                    in: ["ADMIN", "MODERATOR", "Admin", "Moderator"],
                  },
                },
              },
            },
          },
        ],
      };

  const [entities, total] = await Promise.all([
    prisma.reportedEntity.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        updatedAt: true,
        space: { select: { id: true, name: true } },
        handles: {
          orderBy: { createdAt: "asc" },
          take: 5,
          select: { id: true, handle: true, platform: true },
        },
        _count: { select: { posts: { where: visiblePostFilter } } },
      },
    }),
    prisma.reportedEntity.count({ where }),
  ]);

  return {
    entities,
    page,
    query,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export default function ReportedEntitiesPage() {
  const { entities, page, query, total, totalPages } = useLoaderData<typeof loader>();
  const pageUrl = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("page", String(targetPage));
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Entités signalées</h1>
        <p className="text-sm text-muted-foreground">
          {total} résultat{total === 1 ? "" : "s"} dans vos espaces accessibles.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Rechercher</CardTitle></CardHeader>
        <CardContent>
          <Form method="get" className="flex gap-2">
            <Input
              aria-label="Nom ou identifiant Instagram"
              defaultValue={query}
              maxLength={100}
              name="q"
              placeholder="Nom ou @identifiant"
            />
            <Button type="submit"><Search className="mr-2 h-4 w-4" />Rechercher</Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nom</TableHead><TableHead>Handles</TableHead><TableHead>Espace</TableHead><TableHead>Rapports</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {entities.map((entity) => (
                <TableRow key={entity.id}>
                  <TableCell className="font-medium">{entity.name}</TableCell>
                  <TableCell>{entity.handles.map(({ handle }) => `@${handle}`).join(", ") || "—"}</TableCell>
                  <TableCell>{entity.space.name}</TableCell>
                  <TableCell>{entity._count.posts}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/dashboard/entities/${entity.id}`}>Consulter</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {entities.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Aucune entité trouvée.</TableCell></TableRow>
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
