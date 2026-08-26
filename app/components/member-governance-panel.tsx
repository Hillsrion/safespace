import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

type Member = {
  role: string;
  user: { id: string; firstName: string; lastName: string };
};

type History = {
  member: { id: string; firstName: string; lastName: string; role: string | null };
  disciplinaryActions: Array<{
    id: string;
    kind: "warning" | "restriction" | "suspension";
    level: number;
    reason: string;
    status: "active" | "revoked" | "expired";
    expiresAt: string | null;
    createdAt: string;
  }>;
  appeals: Array<{ id: string; reason: string; status: string; createdAt: string }>;
  auditEvents: Array<{ id: string; action: string; createdAt: string }>;
};

export function MemberGovernancePanel({
  members,
  spaceId,
}: {
  members: Member[];
  spaceId: string;
}) {
  const [userId, setUserId] = useState(members[0]?.user.id ?? "");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [history, setHistory] = useState<History | null>(null);
  const [pending, setPending] = useState(false);
  const [revokePendingId, setRevokePendingId] = useState<string | null>(null);
  const [revocationReasons, setRevocationReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async (selectedUserId: string, signal?: AbortSignal) => {
    if (!selectedUserId) {
      setHistory(null);
      return;
    }
    try {
      const response = await fetch(
        `/resources/api/spaces/${spaceId}/members/${selectedUserId}/moderation-history`,
        { credentials: "include", signal }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Historique indisponible."
        );
      }
      setHistory(payload as History);
      setError(null);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setHistory(null);
      setError(caught instanceof Error ? caught.message : "Historique indisponible.");
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadHistory(userId, controller.signal);
    return () => controller.abort();
  }, [spaceId, userId]);

  const issue = async () => {
    if (!userId || !reason.trim()) {
      setError("Sélectionnez un membre et indiquez un motif.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/resources/api/spaces/${spaceId}/moderation/discipline`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            reason,
            ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Mesure impossible."
        );
      }
      setReason("");
      setExpiresAt("");
      await loadHistory(userId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mesure impossible.");
    } finally {
      setPending(false);
    }
  };

  const revoke = async (disciplineId: string) => {
    const revocationReason = revocationReasons[disciplineId]?.trim();
    if (!revocationReason) {
      setError("Indiquez pourquoi cette mesure est révoquée.");
      return;
    }
    setRevokePendingId(disciplineId);
    setError(null);
    try {
      const response = await fetch(
        `/resources/api/spaces/${spaceId}/moderation/discipline/${disciplineId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ revocationReason }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Révocation impossible."
        );
      }
      setRevocationReasons((current) => ({ ...current, [disciplineId]: "" }));
      await loadHistory(userId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Révocation impossible.");
    } finally {
      setRevokePendingId(null);
    }
  };

  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun membre dans cet espace.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="governance-member">Membre</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            id="governance-member"
            onChange={(event) => setUserId(event.target.value)}
            value={userId}
          >
            {members.map((membership) => (
              <option key={membership.user.id} value={membership.user.id}>
                {membership.user.firstName} {membership.user.lastName} · {membership.role}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="discipline-expiry">Expiration (requise dès la restriction)</Label>
          <Input
            id="discipline-expiry"
            min={new Date().toISOString().slice(0, 16)}
            onChange={(event) => setExpiresAt(event.target.value)}
            type="datetime-local"
            value={expiresAt}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="discipline-reason">Motif de la mesure</Label>
        <Textarea
          id="discipline-reason"
          maxLength={2_000}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </div>
      <Button disabled={pending} onClick={issue} size="sm">
        {pending ? "Enregistrement…" : "Appliquer la prochaine mesure progressive"}
      </Button>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="space-y-2">
        <h3 className="font-medium">Historique détaillé</h3>
        {history?.disciplinaryActions.map((item) => (
          <div className="rounded-md border p-3 text-sm" key={item.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <strong>Niveau {item.level} · {item.kind}</strong>
              <span>{item.status} · {new Date(item.createdAt).toLocaleString("fr-FR")}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{item.reason}</p>
            {item.expiresAt && <p className="mt-1 text-muted-foreground">Expire le {new Date(item.expiresAt).toLocaleString("fr-FR")}</p>}
            {item.status === "active" && (
              <div className="mt-3 flex flex-col gap-2 md:flex-row">
                <Input
                  aria-label={`Motif de révocation du niveau ${item.level}`}
                  maxLength={2_000}
                  onChange={(event) =>
                    setRevocationReasons((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                  placeholder="Motif de révocation"
                  value={revocationReasons[item.id] ?? ""}
                />
                <Button
                  disabled={revokePendingId !== null}
                  onClick={() => revoke(item.id)}
                  size="sm"
                  variant="outline"
                >
                  Révoquer
                </Button>
              </div>
            )}
          </div>
        ))}
        {history && history.disciplinaryActions.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune mesure disciplinaire.</p>
        )}
        {history && (
          <p className="text-xs text-muted-foreground">
            {history.appeals.length} appel(s) · {history.auditEvents.length} événement(s) d’audit associé(s)
          </p>
        )}
      </div>
    </div>
  );
}
