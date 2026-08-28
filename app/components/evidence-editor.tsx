import { ArrowDown, ArrowUp, FileLock2, Image, Music2, Trash2, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { MediaDialog } from "~/components/media-dialog";
import { EvidenceMetadataControls } from "~/components/evidence-metadata-controls";
import { evidenceCategoryLabel } from "~/lib/evidence";

export type ExistingEvidence = {
  id: string;
  mimeType: string;
  fileSize: number;
  isBlurred: boolean;
  viewerCanDelete: boolean;
  evidenceCategory?: string;
  caption?: string | null;
  sortOrder?: number;
};

export type PendingEvidence = {
  id: string;
  file: File;
  status: "queued" | "uploading" | "failed";
};

type Props = {
  existingEvidence?: ExistingEvidence[];
  pendingEvidence: PendingEvidence[];
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
  onRetry: (evidenceId: string) => void;
  onDeleted?: (evidenceId: string) => void;
  onRemovePending?: (evidenceId: string) => void;
  expectedRevision?: number;
  onRevisionChange?: (revision: number) => void;
  onEvidenceChanged?: (evidence: ExistingEvidence[]) => void;
  onBusyChange?: (busy: boolean) => void;
};

const EMPTY_EVIDENCE: ExistingEvidence[] = [];

function kindFor(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  return "video";
}

function EvidenceKindIcon({ mimeType }: { mimeType: string }) {
  const kind = kindFor(mimeType);
  if (kind === "image") return <Image className="size-5" aria-hidden="true" />;
  if (kind === "audio") return <Music2 className="size-5" aria-hidden="true" />;
  return <Video className="size-5" aria-hidden="true" />;
}

function sizeLabel(size: number) {
  return `${(size / 1024 / 1024).toFixed(1)} Mo`;
}

/**
 * Private evidence controls deliberately expose neither uploader data nor the
 * original persisted filename. Images are always visually blurred here; full
 * access stays behind the authenticated media endpoint and dedicated viewer.
 */
export function EvidenceEditor({
  existingEvidence = EMPTY_EVIDENCE,
  pendingEvidence,
  disabled = false,
  onFilesSelected,
  onRetry,
  onDeleted,
  onRemovePending,
  expectedRevision,
  onRevisionChange,
  onEvidenceChanged,
  onBusyChange,
}: Props) {
  const [evidence, setEvidence] = useState(existingEvidence);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    requestVersionRef.current += 1;
    setEvidence(existingEvidence);
    setDeletingId(null);
    setConfirmingId(null);
    setDeleteError(null);
    setViewingId(null);
    setEditingId(null); setMetadataError(null);
  }, [existingEvidence]);

  useEffect(() => { onBusyChange?.(editingId !== null || deletingId !== null); }, [editingId, deletingId, onBusyChange]);

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        requestVersionRef.current += 1;
      };
    },
    []
  );

  const deleteEvidence = async (mediaId: string) => {
    if (disabled || deletingId || editingId) return;
    const version = ++requestVersionRef.current;
    setDeletingId(mediaId);
    setDeleteError(null);
    try {
      const response = await fetch(`/resources/api/media/${encodeURIComponent(mediaId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!mountedRef.current || version !== requestVersionRef.current) return;
      if (!response.ok) {
        setDeleteError("Suppression impossible. La preuve est conservée.");
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!mountedRef.current || version !== requestVersionRef.current) return;
      if (Number.isInteger(payload.contentRevision)) onRevisionChange?.(payload.contentRevision);
      setEvidence((current) => current.filter((item) => item.id !== mediaId));
      onDeleted?.(mediaId);
      setConfirmingId(null);
    } catch {
      if (mountedRef.current && version === requestVersionRef.current) {
        setDeleteError("Suppression impossible. La preuve est conservée.");
      }
    } finally {
      if (mountedRef.current && version === requestVersionRef.current) setDeletingId(null);
    }
  };

  const patchEvidence = async (mediaId: string, patch: Record<string, unknown>) => {
    if (disabled || editingId || deletingId || expectedRevision === undefined) return;
    const version = ++requestVersionRef.current;
    setEditingId(mediaId); setMetadataError(null);
    try {
      const response = await fetch(`/resources/api/media/${encodeURIComponent(mediaId)}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision, ...patch }) });
      const payload = await response.json().catch(() => null) as { media?: ExistingEvidence; contentRevision?: number; orderedMediaIds?: string[] } | null;
      if (!mountedRef.current || version !== requestVersionRef.current) return;
      if (!response.ok || payload?.media?.id !== mediaId || !Number.isInteger(payload.contentRevision) || !Array.isArray(payload.orderedMediaIds) || payload.orderedMediaIds.length !== evidence.length || new Set(payload.orderedMediaIds).size !== evidence.length || evidence.some((item) => !payload.orderedMediaIds!.includes(item.id))) {
        setMetadataError(response.status === 409 ? "La preuve a changé. Actualisez le rapport avant de réessayer." : "Modification impossible. La preuve est conservée."); return;
      }
      const updated = payload.orderedMediaIds!.map((id, sortOrder) => ({ ...evidence.find((item) => item.id === id)!, ...(id === mediaId ? payload.media : {}), sortOrder }));
      setEvidence(updated); onEvidenceChanged?.(updated);
      onRevisionChange?.(payload.contentRevision!);
    } catch { if (mountedRef.current && version === requestVersionRef.current) setMetadataError("Modification impossible. La preuve est conservée."); }
    finally { if (mountedRef.current && version === requestVersionRef.current) setEditingId(null); }
  };

  const moveEvidence = (id: string, direction: -1 | 1) => {
    const index = evidence.findIndex((item) => item.id === id); const target = index + direction;
    if (index < 0 || target < 0 || target >= evidence.length) return;
    const ordered = [...evidence]; [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    void patchEvidence(id, { orderedMediaIds: ordered.map((item) => item.id) });
  };

  return (
    <section className="space-y-3 rounded-md border p-4" aria-label="Preuves privées">
      <div className="flex items-start gap-3">
        <FileLock2 className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <div>
          <Label htmlFor="evidence-files">Preuves privées</Label>
          <p className="text-sm text-muted-foreground">
            Images, audio ou vidéo. Les métadonnées sont retirées et les aperçus restent volontairement floutés.
          </p>
        </div>
      </div>

      {deleteError ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      ) : null}
      {metadataError ? <Alert variant="destructive" role="alert"><AlertDescription>{metadataError}</AlertDescription></Alert> : null}

      {evidence.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Preuves existantes">
          {evidence.map((item, index) => {
            const kind = kindFor(item.mimeType);
            return (
              <li key={item.id} className="space-y-2 rounded-md border p-3">
                {kind === "image" ? (
                  <img
                    src={`/resources/api/media/${encodeURIComponent(item.id)}`}
                    alt={`Aperçu flouté de la preuve ${index + 1}`}
                    className="h-28 w-full rounded object-cover blur-2xl"
                  />
                ) : (
                  <div
                    role="img"
                    aria-label={`Aperçu flouté de la preuve ${kind === "audio" ? "audio" : "vidéo"} ${index + 1}`}
                    className="flex h-28 items-center justify-center rounded bg-muted text-muted-foreground blur-[1px]"
                  >
                    <EvidenceKindIcon mimeType={item.mimeType} />
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <EvidenceKindIcon mimeType={item.mimeType} />
                  <span className="capitalize">Preuve {kind}</span>
                  <span className="text-muted-foreground">· {sizeLabel(item.fileSize)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Aperçu flouté par défaut{item.isBlurred ? " · fichier protégé" : ""}.
                </p>
                <p className="text-xs text-muted-foreground">Catégorie : {evidenceCategoryLabel(item.evidenceCategory)}</p>
                {item.caption ? <p className="text-sm">{item.caption}</p> : null}
                {expectedRevision !== undefined && item.viewerCanDelete ? <>
                  <EvidenceMetadataControls id={item.id} category={item.evidenceCategory} caption={item.caption} disabled={disabled || editingId !== null || deletingId !== null} onSave={(patch) => void patchEvidence(item.id, patch)} />
                  {evidence.every((proof) => proof.viewerCanDelete) && <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={disabled || editingId !== null || deletingId !== null || index === 0} onClick={() => moveEvidence(item.id, -1)}><ArrowUp className="size-4" /> Monter</Button>
                    <Button type="button" size="sm" variant="outline" disabled={disabled || editingId !== null || deletingId !== null || index === evidence.length - 1} onClick={() => moveEvidence(item.id, 1)}><ArrowDown className="size-4" /> Descendre</Button>
                  </div>}
                </> : null}
                <Button type="button" size="sm" variant="outline" onClick={() => setViewingId(item.id)}>
                  Afficher la preuve {index + 1}
                </Button>
                {item.viewerCanDelete ? (
                  confirmingId === item.id ? (
                    <div className="space-y-2 rounded bg-muted p-2" role="alert">
                      <p className="text-sm">Supprimer définitivement cette preuve privée&nbsp;?</p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={disabled || deletingId !== null || editingId !== null}
                          onClick={() => void deleteEvidence(item.id)}
                        >
                          {deletingId === item.id ? "Suppression…" : "Confirmer la suppression"}
                        </Button>
                        <Button type="button" size="sm" variant="outline" disabled={deletingId === item.id} onClick={() => setConfirmingId(null)}>
                          Annuler
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled || deletingId !== null || editingId !== null}
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmingId(item.id);
                      }}
                    >
                      <Trash2 className="size-4" /> Supprimer
                    </Button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <Input
        id="evidence-files"
        type="file"
        multiple
        disabled={disabled || deletingId !== null || editingId !== null}
        accept="image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/wav,video/mp4,video/quicktime"
        onChange={(event) => {
          onFilesSelected(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />

      {pendingEvidence.length > 0 ? (
        <ul className="space-y-2 text-sm" aria-label="Nouvelles preuves">
          {pendingEvidence.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2">
              <span className="truncate">{item.file.name} · {sizeLabel(item.file.size)}</span>
              {item.status === "uploading" ? <span className="text-muted-foreground">Téléversement…</span> : null}
              {item.status === "failed" ? (
                <div className="flex items-center gap-2">
                  <span className="text-destructive">Échec du téléversement</span>
                  <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onRetry(item.id)}>
                    Réessayer
                  </Button>
                </div>
              ) : null}
              {onRemovePending && <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onRemovePending(item.id)}>
                Retirer de la sélection
              </Button>}
            </li>
          ))}
        </ul>
      ) : null}
      <MediaDialog
        isOpen={viewingId !== null}
        onOpenChange={(open) => { if (!open) setViewingId(null); }}
        media={evidence.map((item, index) => ({ id: item.id, url: `/resources/api/media/${encodeURIComponent(item.id)}`, type: kindFor(item.mimeType), altText: `Preuve ${index + 1}`, evidenceCategory: item.evidenceCategory, caption: item.caption }))}
        selectedIndex={Math.max(0, evidence.findIndex((item) => item.id === viewingId))}
        onSelectIndex={(index) => setViewingId(evidence[index]?.id ?? null)}
      />
    </section>
  );
}
