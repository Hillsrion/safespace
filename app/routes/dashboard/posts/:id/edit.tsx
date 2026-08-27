import { useLoaderData } from "react-router";
import { ReportForm } from "~/components/report-form";
import { loadReportForEditing as loader } from "~/services/report-edit-loader.server";

export { loader };
export const handle = { crumb: "Modifier le signalement" };

export default function EditReportPage() {
  const { post, spaces, reviewFeedback } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Modifier le signalement</h1>
        <p className="text-sm text-muted-foreground">Chaque modification est enregistrée dans le journal d’audit.</p>
      </div>
      {reviewFeedback?.status === "changes_requested" && <section className="space-y-2 rounded-md border p-4" aria-label="Corrections demandées">
        <h2 className="font-semibold">Corrections demandées — révision {reviewFeedback.revision}</h2>
        {reviewFeedback.corrections.map((correction) => <p key={correction.stage} className="whitespace-pre-wrap text-sm">{correction.note}</p>)}
        <p className="text-sm text-muted-foreground">Modifiez le contenu ou les preuves pour ouvrir une nouvelle revue. Enregistrer sans changement ne relance pas le parcours.</p>
      </section>}
      <ReportForm
        key={post.id}
        initialValues={{
          spaceId: post.spaceId,
          entity: post.entity,
          description: post.description,
          isAnonymous: post.isAnonymous,
          isAdminOnly: post.isAdminOnly,
          severity: post.severity,
          verificationStatus: post.verificationStatus,
        }}
        method="PATCH"
        spaces={spaces}
        submitLabel="Enregistrer les modifications"
        submitUrl={`/resources/api/posts/${post.id}/update`}
        title="Contenu du rapport"
        existingEvidence={post.evidence}
        requiresSensitiveReview={post.requiresSensitiveReview}
      />
    </div>
  );
}
