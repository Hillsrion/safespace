import { useRef, useState } from "react";
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
import { Textarea } from "~/components/ui/textarea";

type SpaceOption = { id: string; name: string };
type HandleReviewStatus = "unreviewed" | "consistent" | "questionable" | "obsolete";
type ReviewableHandle = {
  id: string;
  handle: string;
  platform: string;
  reviewStatus: string;
  reviewNote: string | null;
  reviewedAt: string | Date | null;
};

const HANDLE_REVIEW_LABELS: Record<HandleReviewStatus, string> = {
  unreviewed: "Non examiné",
  consistent: "Cohérent",
  questionable: "À clarifier",
  obsolete: "Obsolète",
};

function normalizeReviewStatus(status: string): HandleReviewStatus {
  return status in HANDLE_REVIEW_LABELS
    ? status as HandleReviewStatus
    : "unreviewed";
}

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

function HandleReviewEditor({
  entityId,
  handle,
  spaceId,
}: {
  entityId: string;
  handle: ReviewableHandle;
  spaceId: string;
}) {
  const revalidator = useRevalidator();
  const pendingRef = useRef(false);
  const initialStatus = normalizeReviewStatus(handle.reviewStatus);
  const [status, setStatus] = useState<HandleReviewStatus>(initialStatus);
  const [note, setNote] = useState(handle.reviewNote ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async () => {
    if (pendingRef.current) return;
    const normalizedNote = note.trim();
    if (status !== "unreviewed" && (normalizedNote.length < 3 || normalizedNote.length > 500)) {
      setError("Une justification de 3 à 500 caractères est requise.");
      setSaved(false);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await entityRequest(
        `/resources/api/spaces/${spaceId}/entities/${entityId}/handles/${handle.id}/review`,
        "PATCH",
        status === "unreviewed" ? { status } : { status, note: normalizedNote }
      );
      setSaved(true);
      if (status === "unreviewed") setNote("");
      revalidator.revalidate();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Opération impossible.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <section className="space-y-3 rounded-md border p-3" aria-labelledby={`handle-review-${handle.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium" id={`handle-review-${handle.id}`}>
            {handle.platform} : @{handle.handle}
          </h3>
          <p className="text-xs text-muted-foreground">
            Revue interne actuelle : {HANDLE_REVIEW_LABELS[initialStatus]}
            {handle.reviewedAt
              ? ` · ${new Date(handle.reviewedAt).toLocaleDateString("fr-FR")}`
              : ""}
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor={`handle-review-status-${handle.id}`}>Statut interne</Label>
          <select
            id={`handle-review-status-${handle.id}`}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            disabled={pending}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as HandleReviewStatus);
              setError(null);
              setSaved(false);
            }}
          >
            {Object.entries(HANDLE_REVIEW_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`handle-review-note-${handle.id}`}>
            Justification {status === "unreviewed" ? "(effacée à l’enregistrement)" : "requise"}
          </Label>
          <Textarea
            id={`handle-review-note-${handle.id}`}
            disabled={pending || status === "unreviewed"}
            maxLength={500}
            placeholder="Expliquez brièvement les éléments observés."
            value={status === "unreviewed" ? "" : note}
            onChange={(event) => {
              setNote(event.target.value);
              setError(null);
              setSaved(false);
            }}
          />
        </div>
        <Button disabled={pending} onClick={submit} type="button">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {saved && <p className="text-sm text-muted-foreground" role="status">Revue interne enregistrée.</p>}
    </section>
  );
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
    handles: ReviewableHandle[];
    postCount: number;
  };
}) {
  const revalidator = useRevalidator();
  const [mode, setMode] = useState<"edit" | "delete" | "review" | null>(null);
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
        <Button size="sm" variant="outline" onClick={() => setMode("review")}>Revue interne</Button>
        <Button size="sm" variant="outline" onClick={() => setMode("edit")}>Modifier</Button>
        <Button disabled={entity.postCount > 0} size="sm" variant="destructive" onClick={() => setMode("delete")}>Supprimer</Button>
      </div>
      <Dialog open={mode !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "delete"
                ? "Supprimer l’entité"
                : mode === "review"
                  ? "Revue interne des identifiants"
                  : "Modifier l’entité"}
            </DialogTitle>
            <DialogDescription>
              {mode === "delete"
                ? "La suppression est définitive et uniquement possible sans rapport lié."
                : mode === "review"
                  ? "Cette qualification aide l’équipe à relire les identifiants. Elle ne confirme ni l’existence ni la propriété d’un compte externe."
                  : "Le remplacement des handles est enregistré dans le journal d’audit."}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {mode === "review" ? (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {entity.handles.map((handle) => (
                <HandleReviewEditor
                  entityId={entity.id}
                  handle={handle}
                  key={handle.id}
                  spaceId={entity.spaceId}
                />
              ))}
            </div>
          ) : mode === "edit" ? (
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
          {mode === "review" ? (
            <DialogFooter><Button variant="outline" onClick={close}>Fermer</Button></DialogFooter>
          ) : (
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
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
