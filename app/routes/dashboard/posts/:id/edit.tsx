import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router";

import { ReportForm } from "~/components/report-form";
import { prisma } from "~/db/client.server";
import { getUserSpaceRole } from "~/db/repositories/spaces/queries.server";
import { getCurrentUser } from "~/services/auth.server";

export const handle = { crumb: "Modifier le signalement" };

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  if (!user) throw redirect("/auth/login");
  if (!params.id) throw new Response("Signalement introuvable", { status: 404 });

  const post = await prisma.post.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      authorId: true,
      spaceId: true,
      description: true,
      isAnonymous: true,
      isAdminOnly: true,
      space: { select: { id: true, name: true } },
      reportedEntity: {
        select: {
          name: true,
          handles: { orderBy: { createdAt: "asc" }, select: { handle: true } },
        },
      },
    },
  });
  if (!post) throw new Response("Signalement introuvable", { status: 404 });

  const role = await getUserSpaceRole(user.id, post.spaceId);
  const mayModerate = role === "ADMIN" || role === "MODERATOR";
  const mayEditOwn = role === "EDITOR" && post.authorId === user.id;
  if (!mayModerate && !mayEditOwn) {
    throw new Response("Accès refusé", { status: 403 });
  }

  return {
    post: {
      id: post.id,
      spaceId: post.spaceId,
      description: post.description,
      isAnonymous: post.isAnonymous,
      isAdminOnly: post.isAdminOnly,
      entity: {
        name: post.reportedEntity.name,
        handles: post.reportedEntity.handles.map(({ handle }) => handle),
      },
    },
    spaces: [{ ...post.space, role: role ?? "" }],
  };
}

export default function EditReportPage() {
  const { post, spaces } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Modifier le signalement</h1>
        <p className="text-sm text-muted-foreground">Chaque modification est enregistrée dans le journal d’audit.</p>
      </div>
      <ReportForm
        initialValues={{
          spaceId: post.spaceId,
          entity: post.entity,
          description: post.description,
          isAnonymous: post.isAnonymous,
          isAdminOnly: post.isAdminOnly,
        }}
        method="PATCH"
        spaces={spaces}
        submitLabel="Enregistrer les modifications"
        submitUrl={`/resources/api/posts/${post.id}/update`}
        title="Contenu du rapport"
      />
    </div>
  );
}
