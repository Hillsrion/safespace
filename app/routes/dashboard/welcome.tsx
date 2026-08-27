import { Link, redirect, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { getUserSpaces } from "~/db/repositories/spaces/queries.server";
import { getCurrentUser } from "~/services/auth.server";
import { Button } from "~/components/ui/button";
import { normalizeSpaceRole } from "~/lib/invitations";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export const handle = { crumb: "Bienvenue" };

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  if (!user) throw redirect("/auth/login");
  const parsed = z.string().uuid().safeParse(new URL(request.url).searchParams.get("spaceId"));
  if (!parsed.success) throw new Response("Espace introuvable", { status: 404 });
  // Re-read effective membership; an old invitation URL is not authorization.
  const space = (await getUserSpaces(user.id)).find(({ id }) => id === parsed.data);
  if (!space) throw new Response("Espace introuvable", { status: 404 });
  return { space: { id: space.id, name: space.name, role: space.role } };
}

export default function Welcome() {
  const { space } = useLoaderData<typeof loader>();
  const canWrite = ["EDITOR", "MODERATOR", "ADMIN"].includes(normalizeSpaceRole(space.role) ?? "");
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Bienvenue dans {space.name}</CardTitle>
        <p className="text-sm text-muted-foreground">Votre accès actuel : {space.role}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <p>Votre invitation a ouvert l’accès à cet espace privé. Les publications et les membres des autres espaces restent séparés.</p>
        <ol className="list-decimal space-y-3 pl-5 text-sm">
          <li>Commencez par consulter le fil ou recherchez un nom et un identifiant Instagram avec la barre de recherche (Ctrl ou ⌘ + K).</li>
          <li>{canWrite ? "Vous pouvez rédiger un signalement, choisir le mode anonyme ou réserver sa visibilité à la modération. Vérifiez les identifiants présents dans le texte et les fichiers avant publication." : "Votre accès permet de consulter, rechercher et signaler un contenu à la modération. Il ne permet pas de publier."}</li>
          <li>Les preuves sont floutées par défaut. N’affichez un contenu sensible que lorsque vous êtes prêt à le consulter et dans un environnement privé.</li>
          <li>« Mon compte » rassemble vos données, vos possibilités de recours et les options pour quitter un espace ou supprimer votre compte.</li>
        </ol>
        <p className="text-sm"><Link className="underline" to="/community-policy">Relire la charte et les règles de publication</Link></p>
        <div className="flex flex-wrap gap-3">
          <Button asChild><Link to={`/dashboard?spaceId=${encodeURIComponent(space.id)}`}>Découvrir mon espace</Link></Button>
          <Button asChild variant="outline"><Link to="/dashboard/account">Gérer mes données</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}
