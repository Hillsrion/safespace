import {
  Form,
  Link,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";

import { ModerationFlagActions } from "~/components/moderation-flag-actions";
import { ModerationAppealActions } from "~/components/moderation-appeal-actions";
import { MemberGovernancePanel } from "~/components/member-governance-panel";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { getUserSpaces } from "~/db/repositories/spaces/queries.server";
import { listModerationFlags } from "~/db/repositories/posts/flags.server";
import { prisma } from "~/db/client.server";
import { getCurrentUser } from "~/services/auth.server";
import { listModerationAppeals } from "~/services/moderation-governance.server";
import { moderationFlagsQuerySchema } from "~/lib/post-flags";
import { appealsQuerySchema } from "~/lib/moderation-governance";

export const handle = { crumb: "File de modération" };

const STATUSES = ["pending_review", "resolved", "rejected"] as const;

function isElevated(role: string) {
  const normalized = role.trim().toUpperCase().replaceAll("-", "_");
  return normalized === "ADMIN" || normalized === "MODERATOR";
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  if (!user) throw redirect("/auth/login");

  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("status");
  const status = STATUSES.find((candidate) => candidate === requestedStatus) ?? "pending_review";
  const spaces = (await getUserSpaces(user.id)).filter(({ role }) => isElevated(role));
  const requestedSpaceId = url.searchParams.get("spaceId");
  const selectedSpace = spaces.find(({ id }) => id === requestedSpaceId) ?? spaces[0];
  const flagsQuery = moderationFlagsQuerySchema.safeParse({ status, limit: 50, cursor: url.searchParams.get("flagCursor") ?? undefined });
  const appealsQuery = appealsQuerySchema.safeParse({ status: "pending", limit: 50, cursor: url.searchParams.get("appealCursor") ?? undefined });
  if (!flagsQuery.success || !appealsQuery.success) throw new Response("Paramètres de pagination invalides", { status: 400 });
  const [queue, appeals, members] = selectedSpace
    ? await Promise.all([
        listModerationFlags(user, {
          spaceId: selectedSpace.id,
          ...flagsQuery.data,
        }),
        listModerationAppeals(user, selectedSpace.id, appealsQuery.data),
        prisma.userSpaceMembership.findMany({
          where: { spaceId: selectedSpace.id },
          orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
          select: {
            role: true,
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
      ])
    : [
        { flags: [], hasNextPage: false, nextCursor: undefined },
        { appeals: [], nextCursor: null, hasMore: false },
        [],
      ];

  return { appeals, members, queue, selectedSpaceId: selectedSpace?.id ?? "", spaces, status, flagCursor: flagsQuery.data.cursor, appealCursor: appealsQuery.data.cursor };
}

export default function ModerationPage() {
  const { appeals, members, queue, selectedSpaceId, spaces, status, flagCursor, appealCursor } = useLoaderData<typeof loader>();
  const pageUrl = (kind: "flagCursor" | "appealCursor", cursor?: string | null) => {
    const params = new URLSearchParams({ spaceId: selectedSpaceId, status });
    if (flagCursor) params.set("flagCursor", flagCursor);
    if (appealCursor) params.set("appealCursor", appealCursor);
    if (cursor) params.set(kind, cursor); else params.delete(kind);
    return `?${params}`;
  };

  if (spaces.length === 0) {
    return (
      <Alert>
        <AlertTitle>Aucun espace à modérer</AlertTitle>
        <AlertDescription>Cette file est réservée aux modérateurs et administrateurs.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">File de modération</h1>
        <p className="text-sm text-muted-foreground">Examinez les signalements sans exposer l’identité de leurs auteurs.</p>
        <Link to="/dashboard/sensitive-reviews" className="mt-2 inline-block text-sm underline">Revue des allégations sensibles à trois niveaux</Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Form method="get" className="grid gap-3 md:grid-cols-[1fr_240px_auto]">
            <select aria-label="Espace à modérer" name="spaceId" defaultValue={selectedSpaceId} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
            <select aria-label="Statut des signalements" name="status" defaultValue={status} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="pending_review">En attente</option>
              <option value="resolved">Résolus</option>
              <option value="rejected">Rejetés</option>
            </select>
            <Button type="submit">Afficher</Button>
          </Form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {queue.flags.map((flag) => (
          <Card key={flag.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>{flag.post.reportedEntity.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Signalé le {new Date(flag.createdAt).toLocaleString("fr-FR")}</p>
                </div>
                <Badge variant={flag.post.status === "hidden" ? "destructive" : "outline"}>{flag.post.status === "hidden" ? "Masqué" : "Visible"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm">{flag.post.description}</p>
              <div className="rounded-md bg-muted p-3 text-sm">
                <span className="font-medium">Motif : </span>{flag.reason || "Aucun motif fourni"}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button asChild size="sm" variant="outline"><Link to={`/dashboard/posts/${flag.post.id}/edit`}>Ouvrir le rapport</Link></Button>
                {status === "pending_review" && <ModerationFlagActions flagId={flag.id} spaceId={selectedSpaceId} />}
              </div>
            </CardContent>
          </Card>
        ))}
        {queue.flags.length === 0 && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Aucun signalement dans cette file.</CardContent></Card>
        )}
        <div className="flex gap-3">
          {flagCursor && <Button asChild variant="outline"><Link to={pageUrl("flagCursor")}>Premiers signalements</Link></Button>}
          {queue.nextCursor && <Button asChild variant="outline"><Link to={pageUrl("flagCursor", queue.nextCursor)}>Signalements suivants</Link></Button>}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Appels en attente ({appeals.appeals.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {appeals.appeals.map((appeal) => (
            <div className="space-y-3 rounded-md border p-4" key={appeal.id}>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <strong>Seconde revue demandée</strong>
                <span className="text-muted-foreground">
                  {new Date(appeal.createdAt).toLocaleString("fr-FR")}
                </span>
              </div>
              <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
                <strong>{appeal.post.entityName}</strong>
                <p className="whitespace-pre-wrap">{appeal.post.description}</p>
                <p>Motif du signalement initial : {appeal.originalDecision.reason || "Aucun motif fourni"}</p>
                <p>Décision contestée : {appeal.originalDecision.status}{appeal.originalDecision.resolvedAt ? ` · ${new Date(appeal.originalDecision.resolvedAt).toLocaleString("fr-FR")}` : ""}</p>
                <Link className="underline" to={`/dashboard/posts/${appeal.post.id}/edit`}>Examiner le rapport et ses preuves</Link>
              </div>
              <h3 className="text-sm font-medium">Motif de l’appel</h3>
              <p className="whitespace-pre-wrap text-sm">{appeal.reason}</p>
              <ModerationAppealActions appealId={appeal.id} spaceId={selectedSpaceId} />
            </div>
          ))}
          {appeals.appeals.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun appel en attente.</p>
          )}
          <div className="flex gap-3">
            {appealCursor && <Button asChild variant="outline"><Link to={pageUrl("appealCursor")}>Premiers appels</Link></Button>}
            {appeals.nextCursor && <Button asChild variant="outline"><Link to={pageUrl("appealCursor", appeals.nextCursor)}>Appels suivants</Link></Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Discipline progressive et historique</CardTitle></CardHeader>
        <CardContent>
          <MemberGovernancePanel key={selectedSpaceId} members={members} spaceId={selectedSpaceId} />
        </CardContent>
      </Card>
    </div>
  );
}
