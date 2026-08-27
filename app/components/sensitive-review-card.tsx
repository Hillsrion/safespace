import { useState } from "react";
import { Link, useRevalidator } from "react-router";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { MediaCarousel } from "~/components/media-carousel";
import { MediaDialog } from "~/components/media-dialog";
import { SENSITIVE_REVIEW_STAGES, SENSITIVE_REVIEW_STATUSES } from "~/lib/sensitive-review";
import type { EvidenceMedia } from "~/lib/types";
import type { listSensitiveReviews } from "~/services/sensitive-review.server";

type ReviewItem = Awaited<ReturnType<typeof listSensitiveReviews>>["items"][number];
export function SensitiveReviewCard({ item }: { item: ReviewItem }) {
  const revalidator = useRevalidator();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaIndex, setMediaIndex] = useState<number | null>(null);
  const current = item.rounds.find(({ revision }) => revision === item.contentRevision);
  const media: EvidenceMedia[] = item.media.map((proof, index) => ({
    id: proof.id, url: `/resources/api/media/${encodeURIComponent(proof.id)}`,
    type: proof.mimeType.startsWith("image/") ? "image" : proof.mimeType.startsWith("audio/") ? "audio" : "video",
    altText: `Preuve ${index + 1}`,
  }));
  const mutate = async (outcome?: "approve" | "request_changes") => {
    setPending(true); setError(null);
    try {
      const response = await fetch(`/resources/api/spaces/${item.spaceId}/sensitive-reviews/${item.id}`, {
        method: item.requiresSensitiveReview ? "PATCH" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.requiresSensitiveReview
          ? { revision: item.contentRevision, stage: item.nextStage, outcome, note: note.trim() }
          : { revision: item.contentRevision, reason: note.trim() }),
      });
      if (!response.ok) {
        setError(response.status === 409 ? "La révision ou l’étape a changé. Rechargez la file avant de décider."
          : response.status === 403 ? "Cette décision nécessite une autre personne autorisée, sans restriction active."
            : "La décision n’a pas pu être enregistrée. Réessayez.");
        return;
      }
      setNote(""); revalidator.revalidate();
    } catch { setError("Connexion interrompue. Rechargez la file pour vérifier si la décision a été enregistrée."); }
    finally { setPending(false); }
  };
  return <Card>
    <CardHeader>
      <CardTitle>{item.entity.name}</CardTitle>
      <p className="text-sm text-muted-foreground">{item.entity.handles.map((handle) => `@${handle}`).join(" · ")}</p>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">Révision {item.contentRevision}</Badge>
        <Badge variant={item.status === "hidden" ? "destructive" : "outline"}>{item.status === "hidden" ? "Masqué" : "Visible"}</Badge>
        {item.isAdminOnly && <Badge variant="outline">Accès restreint à la modération</Badge>}
        {current && <Badge variant="secondary">{SENSITIVE_REVIEW_STATUSES[current.status]}</Badge>}
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="whitespace-pre-wrap text-sm">{item.description}</p>
      {media.length > 0 && <>
        <p className="text-sm text-muted-foreground">Preuves potentiellement sensibles — affichage volontaire uniquement.</p>
        <MediaCarousel media={media} onMediaClick={setMediaIndex} />
        <MediaDialog isOpen={mediaIndex !== null} onOpenChange={(open) => { if (!open) setMediaIndex(null); }} media={media} selectedIndex={mediaIndex ?? 0} onSelectIndex={setMediaIndex} />
      </>}
      {current && <div className="space-y-2 text-sm">
        <p>Motif de revue : {current.reason}</p>
        <ol className="list-decimal space-y-2 pl-5">
          {SENSITIVE_REVIEW_STAGES.map((label, index) => {
            const decision = current.decisions.find(({ stage }) => stage === index + 1);
            return <li key={label}><strong>{label}</strong> — {decision ? decision.outcome === "approve" ? "Approuvé" : "Correction demandée" : "En attente"}
              {decision && <p className="whitespace-pre-wrap text-muted-foreground">{decision.note}</p>}
            </li>;
          })}
        </ol>
      </div>}
      {(!item.requiresSensitiveReview || item.canDecide) && <div className="space-y-3 rounded-md border p-4">
        <Label htmlFor={`review-note-${item.id}`}>{item.requiresSensitiveReview ? "Justification de votre décision" : "Motif du classement sensible"}</Label>
        <p className="text-xs text-muted-foreground">10 à 2 000 caractères. Ne recopiez pas d’identité, de coordonnées ni le contenu des preuves.</p>
        <Textarea id={`review-note-${item.id}`} value={note} onChange={(event) => setNote(event.target.value)} minLength={10} maxLength={2000} disabled={pending} />
        <div className="flex flex-wrap gap-2">
          {item.requiresSensitiveReview ? <>
            <Button disabled={pending || note.trim().length < 10} onClick={() => mutate("approve")}>Approuver cette étape</Button>
            <Button variant="outline" disabled={pending || note.trim().length < 10} onClick={() => mutate("request_changes")}>Demander une correction</Button>
          </> : <Button disabled={pending || note.trim().length < 10} onClick={() => mutate()}>Exiger la revue à trois niveaux</Button>}
        </div>
      </div>}
      {current?.status === "pending" && !item.canDecide && <p className="text-sm text-muted-foreground">Cette étape attend une autre personne disposant du rôle requis ; l’auteur ne peut jamais examiner son propre rapport.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button asChild size="sm" variant="outline"><Link to={`/dashboard/posts/${item.id}/edit`}>Ouvrir le rapport</Link></Button>
      {item.rounds.length > 1 && <details className="text-sm"><summary className="cursor-pointer">Historique des révisions précédentes (10 dernières au maximum)</summary>
        {item.rounds.filter(({ revision }) => revision !== item.contentRevision).map((round) => <div key={round.id} className="mt-3 rounded border p-3">
          <p>Révision {round.revision} — {SENSITIVE_REVIEW_STATUSES[round.status]}</p>
          {round.decisions.map((decision) => <p key={decision.stage}>{SENSITIVE_REVIEW_STAGES[decision.stage - 1]} : {decision.outcome === "approve" ? "Approuvé" : "Correction demandée"} — {decision.note}</p>)}
        </div>)}
      </details>}
    </CardContent>
  </Card>;
}
