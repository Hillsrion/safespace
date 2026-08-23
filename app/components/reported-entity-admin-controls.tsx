import { useState } from "react";
import { useRevalidator } from "react-router";

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

type SpaceOption = { id: string; name: string };

function normalizeHandles(value: string) {
  return [...new Set(
    value
      .split(/[\n,]/)
      .map((handle) => handle.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean)
  )].map((handle) => ({ platform: "Instagram", handle }));
}

async function entityRequest(url: string, method: "POST" | "PATCH" | "DELETE", body?: object) {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : "Opération impossible."
    );
  }
}

export function CreateReportedEntityControl({ spaces }: { spaces: SpaceOption[] }) {
  const revalidator = useRevalidator();
  const [open, setOpen] = useState(false);
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [name, setName] = useState("");
  const [handles, setHandles] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (spaces.length === 0) return null;

  const submit = async () => {
    const normalizedHandles = normalizeHandles(handles);
    if (!spaceId || !name.trim() || normalizedHandles.length === 0) {
      setError("Le nom, l’espace et au moins un handle sont requis.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await entityRequest(`/resources/api/spaces/${spaceId}/entities`, "POST", {
        name: name.trim(),
        handles: normalizedHandles,
      });
      setOpen(false);
      setName("");
      setHandles("");
      revalidator.revalidate();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Opération impossible."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>Ajouter une entité</Button>
      <Dialog open={open} onOpenChange={(nextOpen) => !pending && setOpen(nextOpen)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une entité signalée</DialogTitle>
            <DialogDescription>
              Cette entrée sera immédiatement visible dans l’espace sélectionné.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="entity-create-space">Espace</Label>
              <select
                id="entity-create-space"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={spaceId}
                onChange={(event) => setSpaceId(event.target.value)}
              >
                {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-create-name">Nom</Label>
              <Input id="entity-create-name" maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-create-handles">Handles Instagram</Label>
              <Input id="entity-create-handles" maxLength={1000} placeholder="handle1, handle2" value={handles} onChange={(event) => setHandles(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={pending} variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button disabled={pending} onClick={submit}>{pending ? "Ajout…" : "Ajouter"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ReportedEntityAdminActions({
  entity,
}: {
  entity: {
    id: string;
    name: string;
    spaceId: string;
    handles: Array<{ handle: string; platform: string }>;
    postCount: number;
  };
}) {
  const revalidator = useRevalidator();
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [name, setName] = useState(entity.name);
  const [handles, setHandles] = useState(entity.handles.map(({ handle }) => handle).join(", "));
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endpoint = `/resources/api/spaces/${entity.spaceId}/entities/${entity.id}`;

  const close = () => {
    if (pending) return;
    setMode(null);
    setError(null);
    setConfirmation("");
  };

  const submitEdit = async () => {
    const normalizedHandles = normalizeHandles(handles);
    if (!name.trim() || normalizedHandles.length === 0) {
      setError("Le nom et au moins un handle sont requis.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await entityRequest(endpoint, "PATCH", {
        name: name.trim(),
        handles: normalizedHandles,
      });
      setMode(null);
      revalidator.revalidate();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Opération impossible.");
    } finally {
      setPending(false);
    }
  };

  const submitDelete = async () => {
    if (confirmation !== entity.name) return;
    setPending(true);
    setError(null);
    try {
      await entityRequest(endpoint, "DELETE");
      setMode(null);
      revalidator.revalidate();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Opération impossible.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setMode("edit")}>Modifier</Button>
        <Button disabled={entity.postCount > 0} size="sm" variant="destructive" onClick={() => setMode("delete")}>Supprimer</Button>
      </div>
      <Dialog open={mode !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === "delete" ? "Supprimer l’entité" : "Modifier l’entité"}</DialogTitle>
            <DialogDescription>
              {mode === "delete"
                ? "La suppression est définitive et uniquement possible sans rapport lié."
                : "Le remplacement des handles est enregistré dans le journal d’audit."}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {mode === "edit" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`entity-name-${entity.id}`}>Nom</Label>
                <Input id={`entity-name-${entity.id}`} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`entity-handles-${entity.id}`}>Handles Instagram</Label>
                <Input id={`entity-handles-${entity.id}`} maxLength={1000} value={handles} onChange={(event) => setHandles(event.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor={`entity-delete-${entity.id}`}>Saisissez {entity.name} pour confirmer</Label>
              <Input id={`entity-delete-${entity.id}`} autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button disabled={pending} variant="outline" onClick={close}>Annuler</Button>
            <Button
              disabled={pending || (mode === "delete" && confirmation !== entity.name)}
              variant={mode === "delete" ? "destructive" : "default"}
              onClick={mode === "delete" ? submitDelete : submitEdit}
            >
              {pending ? "Traitement…" : mode === "delete" ? "Supprimer" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
