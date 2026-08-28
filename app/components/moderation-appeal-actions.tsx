import { useState } from "react";
import { useRevalidator } from "react-router";

import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { ModerationTemplatePicker } from "~/components/moderation-template-picker";
import { hasUnfilledModerationTemplate } from "~/lib/moderation-templates";

export function ModerationAppealActions({
  appealId,
  spaceId,
}: {
  appealId: string;
  spaceId: string;
}) {
  const revalidator = useRevalidator();
  const [decisionNote, setDecisionNote] = useState("");
  const [pending, setPending] = useState<"upheld" | "overturned" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (status: "upheld" | "overturned") => {
    if (!decisionNote.trim() || hasUnfilledModerationTemplate(decisionNote)) {
      setError("Une justification complète est requise. Remplacez les champs du modèle.");
      return;
    }
    setPending(status);
    setError(null);
    try {
      const response = await fetch(
        `/resources/api/spaces/${spaceId}/moderation/appeals/${appealId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, decisionNote }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof payload.error === "string"
            ? payload.error
            : "La décision n’a pas pu être enregistrée."
        );
        return;
      }
      revalidator.revalidate();
    } catch {
      setError("La décision n’a pas pu être enregistrée.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-2">
      <ModerationTemplatePicker category="appeal" value={decisionNote} onChange={setDecisionNote} disabled={pending !== null} />
      <Textarea
        aria-label="Justification de la décision"
        maxLength={2_000}
        onChange={(event) => setDecisionNote(event.target.value)}
        placeholder="Justification de la seconde revue"
        value={decisionNote}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending !== null}
          onClick={() => decide("overturned")}
          size="sm"
        >
          Réouvrir le signalement
        </Button>
        <Button
          disabled={pending !== null}
          onClick={() => decide("upheld")}
          size="sm"
          variant="outline"
        >
          Confirmer la décision
        </Button>
      </div>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
