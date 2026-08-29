import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router";

import { ReportForm } from "~/components/report-form";
import { getUserSpaces } from "~/db/repositories/spaces/queries.server";
import { getCurrentUser } from "~/services/auth.server";

export const handle = { crumb: "Nouveau signalement" };

function canWrite(role: string): boolean {
  return ["EDITOR", "MODERATOR", "ADMIN"].includes(
    role.trim().toUpperCase().replaceAll("-", "_")
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  if (!user) throw redirect("/auth/login");

  const spaces = (await getUserSpaces(user.id)).filter((space) => canWrite(space.role));
  const requestedSpaceId = new URL(request.url).searchParams.get("spaceId");
  const selectedSpace = spaces.find(({ id }) => id === requestedSpaceId) ?? spaces[0];

  return { spaces, selectedSpaceId: selectedSpace?.id ?? "" };
}

export default function NewReportPage() {
  const { spaces, selectedSpaceId } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Ajouter un signalement</h1>
        <p className="text-sm text-muted-foreground">Partagez des faits précis dans un espace auquel vous appartenez.</p>
      </div>
      <ReportForm
        initialValues={{
          spaceId: selectedSpaceId,
          entity: { name: "", handles: [""] },
          description: "",
          isAnonymous: false,
          isAdminOnly: false,
          severity: "medium",
          verificationStatus: "unverified",
        }}
        method="POST"
        spaces={spaces}
        submitLabel="Publier le signalement"
        title="Informations du rapport"
      />
    </div>
  );
}
