import { data, Form, Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/services/auth.server";
import { getUserSpaces } from "~/db/repositories/spaces/index.server";
import { listSensitiveReviews } from "~/services/sensitive-review.server";
import { sensitiveReviewQuerySchema } from "~/lib/sensitive-review";
import { SensitiveReviewCard } from "~/components/sensitive-review-card";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";

export async function loader({ request }: LoaderFunctionArgs) {
  const actor = await requireUser(request);
  const url = new URL(request.url);
  const spaces = (await getUserSpaces(actor.id)).filter(({ role }) => ["ADMIN", "MODERATOR"].includes(role.toUpperCase()));
  const selected = spaces.find(({ id }) => id === url.searchParams.get("spaceId")) ?? spaces[0];
  const parsed = sensitiveReviewQuerySchema.safeParse({
    classification: url.searchParams.get("classification") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) throw new Response("Invalid review queue parameters", { status: 400 });
  const queue = selected ? await listSensitiveReviews(actor, selected.id, parsed.data) : { items: [], nextCursor: null, hasMore: false };
  return data({ spaces, spaceId: selected?.id ?? "", classification: parsed.data.classification, queue }, { headers: { "Cache-Control": "private, no-store" } });
}

export default function SensitiveReviewsPage() {
  const { spaces, spaceId, classification, queue } = useLoaderData<typeof loader>();
  return <div className="space-y-6 p-4 md:p-6">
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Revue des allégations sensibles</h1>
      <p className="text-sm text-muted-foreground">Modérateur → administrateur de l’espace → superadministrateur : trois personnes distinctes, jamais l’auteur.</p>
      <p className="text-sm text-muted-foreground">La revue interne ne constitue pas une vérité judiciaire. La visibilité ne change pas ; toute modification du contenu, de la cible ou des preuves exige une nouvelle revue.</p>
      <Link to="/dashboard/moderation" className="text-sm underline">Signalements et appels : file distincte</Link>
    </div>
    {spaces.length === 0 ? <p>Aucun espace à examiner. Cette file est réservée à la modération.</p> : <>
      <Form method="get" className="flex flex-wrap items-end gap-3">
        <div className="space-y-2"><Label htmlFor="review-space">Espace</Label><select id="review-space" name="spaceId" defaultValue={spaceId} className="block h-9 rounded-md border bg-transparent px-3 text-sm">
          {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
        </select></div>
        <div className="space-y-2"><Label htmlFor="review-classification">File</Label><select id="review-classification" name="classification" defaultValue={classification} className="block h-9 rounded-md border bg-transparent px-3 text-sm">
          <option value="required">Rapports sensibles et historique</option><option value="unclassified">Autres rapports : classement manuel</option>
        </select></div>
        <Button type="submit">Afficher</Button>
      </Form>
      {queue.items.map((item) => <SensitiveReviewCard key={`${item.id}-${item.contentRevision}-${item.nextStage}`} item={item} />)}
      {queue.items.length === 0 && <p className="text-sm text-muted-foreground">Aucun rapport dans cette file.</p>}
      {queue.nextCursor && <Button asChild variant="outline"><Link to={`?${new URLSearchParams({ spaceId, classification, cursor: queue.nextCursor })}`}>Page suivante</Link></Button>}
    </>}
  </div>;
}
