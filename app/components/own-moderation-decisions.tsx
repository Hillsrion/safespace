import { useState } from "react";
import { useRevalidator } from "react-router";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

type Decision = {
  id: string;
  reason: string | null;
  resolvedAt: string | null;
  entityName: string;
  space: { id: string; name: string };
  latestAppeal: {
    id: string;
    status: "pending" | "upheld" | "overturned";
    decisionNote: string | null;
    decidedAt: string | null;
    createdAt: string;
  } | null;
};

function mayAppeal(decision: Decision): boolean {
  if (!decision.latestAppeal) return true;
  if (decision.latestAppeal.status === "pending") return false;
  if (!decision.resolvedAt || !decision.latestAppeal.decidedAt) return false;
  return new Date(decision.resolvedAt) > new Date(decision.latestAppeal.decidedAt);
}

export function OwnModerationDecisions({ decisions }: { decisions: Decision[] }) {
  const revalidator = useRevalidator();
  const [reasonByFlag, setReasonByFlag] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const appeal = async (decision: Decision) => {
    const reason = reasonByFlag[decision.id]?.trim();
    if (!reason) {
      setError("Expliquez pourquoi la décision doit être réexaminée.");
      return;
    }
    setPendingId(decision.id);
    setError(null);
    try {
      const response = await fetch(
        `/resources/api/spaces/${decision.space.id}/moderation/appeals`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flagId: decision.id, reason }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Appel impossible."
        );
      }
      setReasonByFlag((current) => ({ ...current, [decision.id]: "" }));
      revalidator.revalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Appel impossible.");
    } finally {
      setPendingId(null);
    }
  };

  if (decisions.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune décision contestable.</p>;
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {decisions.map((decision) => {
        const appealAllowed = mayAppeal(decision);
        return (
          <div className="space-y-3 rounded-md border p-4" key={decision.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{decision.entityName}</p>
                <p className="text-xs text-muted-foreground">{decision.space.name}</p>
              </div>
              <Badge variant="outline">
                {decision.latestAppeal?.status === "pending"
                  ? "Appel en attente"
                  : decision.latestAppeal?.status === "upheld"
                    ? "Décision confirmée"
                    : decision.latestAppeal?.status === "overturned"
                      ? "Décision annulée"
                      : "Signalement rejeté"}
              </Badge>
            </div>
            {decision.reason && <p className="text-sm">Motif initial : {decision.reason}</p>}
            {decision.latestAppeal?.decisionNote && (
              <p className="rounded-md bg-muted p-3 text-sm">
                Réponse de la seconde revue : {decision.latestAppeal.decisionNote}
              </p>
            )}
            {appealAllowed && (
              <div className="space-y-2">
                <Textarea
                  aria-label={`Motif d’appel pour ${decision.entityName}`}
                  maxLength={2_000}
                  onChange={(event) =>
                    setReasonByFlag((current) => ({
                      ...current,
                      [decision.id]: event.target.value,
                    }))
                  }
                  placeholder="Pourquoi demandez-vous une seconde revue ?"
                  value={reasonByFlag[decision.id] ?? ""}
                />
                <Button
                  disabled={pendingId !== null}
                  onClick={() => appeal(decision)}
                  size="sm"
                  variant="outline"
                >
                  Demander une seconde revue
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
