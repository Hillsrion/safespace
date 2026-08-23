import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

type ContributionPolicy = "anonymize" | "delete";
type DestructiveIntent =
  | {
      kind: "leave";
      contributionPolicy: ContributionPolicy;
      spaceId: string;
      spaceName: string;
    }
  | { kind: "account"; contributionPolicy: ContributionPolicy };

export function AccountDangerZone({
  memberships,
}: {
  memberships: Array<{ role: string; space: { id: string; name: string } }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [intent, setIntent] = useState<DestructiveIntent | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");

  const beginIntent = (nextIntent: DestructiveIntent) => {
    setError(null);
    setConfirmation("");
    setPassword("");
    setIntent(nextIntent);
  };

  const closeDialog = () => {
    if (pending) return;
    setIntent(null);
    setConfirmation("");
    setPassword("");
  };

  const mutation = async (
    url: string,
    method: "POST" | "DELETE",
    body: object
  ) => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof payload.error === "string"
            ? payload.error
            : "Opération impossible."
        );
        return false;
      }
      window.location.assign("/auth/login");
      return true;
    } catch {
      setError(
        "Le serveur est momentanément inaccessible. Vérifiez votre connexion et réessayez."
      );
      return false;
    } finally {
      setPending(false);
    }
  };

  const submitIntent = async () => {
    if (!intent) return;

    const expected = intent.kind === "leave" ? "LEAVE_SPACE" : "DELETE_ACCOUNT";
    if (confirmation !== expected || (intent.kind === "account" && !password)) {
      setError("La confirmation demandée est incomplète.");
      return;
    }

    if (intent.kind === "leave") {
      await mutation(
        `/resources/api/spaces/${intent.spaceId}/leave`,
        "POST",
        {
          confirmation,
          contributionPolicy: intent.contributionPolicy,
        }
      );
      return;
    }

    await mutation("/resources/api/account/delete", "DELETE", {
      confirmation,
      contributionPolicy: intent.contributionPolicy,
      password,
    });
  };

  const expectedConfirmation =
    intent?.kind === "leave" ? "LEAVE_SPACE" : "DELETE_ACCOUNT";
  const deletesContributions = intent?.contributionPolicy === "delete";

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Opération refusée</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        <h3 className="font-semibold">Mes espaces</h3>
        {memberships.map((membership) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            key={membership.space.id}
          >
            <div>
              <p className="font-medium">{membership.space.name}</p>
              <p className="text-sm text-muted-foreground">
                {membership.role}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending}
                size="sm"
                variant="outline"
                onClick={() =>
                  beginIntent({
                    kind: "leave",
                    contributionPolicy: "anonymize",
                    spaceId: membership.space.id,
                    spaceName: membership.space.name,
                  })
                }
              >
                Quitter et anonymiser
              </Button>
              <Button
                disabled={pending}
                size="sm"
                variant="destructive"
                onClick={() =>
                  beginIntent({
                    kind: "leave",
                    contributionPolicy: "delete",
                    spaceId: membership.space.id,
                    spaceName: membership.space.name,
                  })
                }
              >
                Quitter et supprimer
              </Button>
            </div>
          </div>
        ))}
        {memberships.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucune adhésion active.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-md border border-destructive/40 p-4">
        <h3 className="font-semibold text-destructive">Supprimer mon compte</h3>
        <p className="text-sm text-muted-foreground">
          Cette action est définitive. Vos médias et signalements de modération
          seront supprimés. Elle peut être bloquée si vous êtes le dernier
          administrateur ou si des données doivent d’abord être transférées.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            variant="outline"
            onClick={() =>
              beginIntent({ kind: "account", contributionPolicy: "anonymize" })
            }
          >
            Supprimer le compte et anonymiser les rapports
          </Button>
          <Button
            disabled={pending}
            variant="destructive"
            onClick={() =>
              beginIntent({ kind: "account", contributionPolicy: "delete" })
            }
          >
            Supprimer le compte et ses rapports
          </Button>
        </div>
      </div>

      <Dialog open={intent !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {intent?.kind === "leave"
                ? `Quitter « ${intent.spaceName} »`
                : "Supprimer définitivement mon compte"}
            </DialogTitle>
            <DialogDescription>
              {deletesContributions
                ? "Vos rapports dans le périmètre concerné, leurs médias et vos signalements seront supprimés définitivement."
                : "Vos rapports seront conservés sans lien avec votre identité. Vos médias et signalements seront supprimés définitivement."}
              {" "}Cette opération vous déconnectera.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertTitle>Opération refusée</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="danger-confirmation">
                Saisissez {expectedConfirmation} pour confirmer
              </Label>
              <Input
                id="danger-confirmation"
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
            {intent?.kind === "account" && (
              <div className="space-y-2">
                <Label htmlFor="danger-password">Mot de passe actuel</Label>
                <Input
                  id="danger-password"
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button disabled={pending} variant="outline" onClick={closeDialog}>
              Annuler
            </Button>
            <Button
              disabled={
                pending ||
                confirmation !== expectedConfirmation ||
                (intent?.kind === "account" && password.length === 0)
              }
              variant="destructive"
              onClick={submitIntent}
            >
              {pending ? "Traitement…" : "Confirmer l’opération"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
