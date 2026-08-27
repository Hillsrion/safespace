import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { EvidenceEditor, type ExistingEvidence, type PendingEvidence } from "~/components/evidence-editor";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  createReportSchema,
  type CreateReportInput,
  type ReportWriteResponse,
} from "~/lib/reports";

export type WritableSpace = { id: string; name: string; role: string };

type ReportFormProps = {
  initialValues: CreateReportInput;
  method: "POST" | "PATCH";
  spaces: WritableSpace[];
  submitLabel: string;
  submitUrl: string;
  title: string;
  existingEvidence?: ExistingEvidence[];
  requiresSensitiveReview?: boolean;
};

type ErrorPayload = { error?: string };

export function ReportForm({
  initialValues,
  method,
  spaces,
  submitLabel,
  submitUrl,
  title,
  existingEvidence = [],
  requiresSensitiveReview = false,
}: ReportFormProps) {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingEvidence, setPendingEvidence] = useState<PendingEvidence[]>([]);
  const [savedEvidence, setSavedEvidence] = useState<ExistingEvidence[]>(existingEvidence);
  const [reviewRequired, setReviewRequired] = useState(requiresSensitiveReview);
  const [persistedPost, setPersistedPost] = useState<{
    id: string;
    spaceId: string;
    reportedEntityId: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const evidenceSequenceRef = useRef(0);
  const uploadGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const uploadBusyRef = useRef(false);
  const saveBusyRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; uploadGenerationRef.current += 1; };
  }, []);
  const form = useForm<CreateReportInput>({
    resolver: zodResolver(createReportSchema) as Resolver<CreateReportInput>,
    defaultValues: initialValues,
  });
  const handles = form.watch("entity.handles");
  const selectedSpaceId = form.watch("spaceId");
  const selectedRole = spaces
    .find((space) => space.id === selectedSpaceId)
    ?.role.trim()
    .toUpperCase()
    .replaceAll("-", "_");
  const mayVerify = selectedRole === "ADMIN" || selectedRole === "MODERATOR";
  const isSensitive = reviewRequired || form.watch("severity") === "high";

  const replaceHandles = (nextHandles: string[]) => {
    form.setValue("entity.handles", nextHandles, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const addEvidenceFiles = (files: File[]) => {
    setPendingEvidence((current) => {
      const existingSignatures = new Set(
        current.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`)
      );
      const remaining = Math.max(0, 10 - savedEvidence.length - current.length);
      const uniqueFiles = files.filter((file) => {
        const signature = `${file.name}:${file.size}:${file.lastModified}`;
        if (existingSignatures.has(signature)) return false;
        existingSignatures.add(signature);
        return true;
      });
      const accepted = uniqueFiles.slice(0, remaining);
      if (accepted.length < files.length) {
        toast.error("Un rapport peut contenir au maximum 10 preuves sans doublon.");
      }
      return [
        ...current,
        ...accepted.map((file) => ({
          id: `new-evidence-${++evidenceSequenceRef.current}`,
          file,
          status: "queued" as const,
        })),
      ];
    });
  };

  const uploadEvidence = async (
    target: { id: string; spaceId: string; reportedEntityId: string },
    items: PendingEvidence[]
  ) => {
    if (items.length === 0) return true;
    if (uploadBusyRef.current) return false;
    uploadBusyRef.current = true;
    const generation = ++uploadGenerationRef.current;
    setIsUploading(true);
    setPendingEvidence((current) =>
      current.map((item) =>
        items.some((candidate) => candidate.id === item.id)
          ? { ...item, status: "uploading" }
          : item
      )
    );
    let allUploaded = true;
    for (const item of items) {
      try {
        const upload = new FormData();
        upload.set("file", item.file);
        upload.set("spaceId", target.spaceId);
        upload.set("postId", target.id);
        const response = await fetch("/resources/api/media/upload", {
          method: "POST",
          credentials: "include",
          body: upload,
        });
        if (!mountedRef.current || generation !== uploadGenerationRef.current) return false;
        if (!response.ok) throw new Error("upload_failed");
        const result = await response.json();
        if (!mountedRef.current || generation !== uploadGenerationRef.current) return false;
        if (!result.mediaId || typeof result.mediaId !== "string") throw new Error("upload_failed");
        setSavedEvidence((current) => [...current, {
          id: result.mediaId, mimeType: result.mimeType ?? item.file.type, fileSize: result.fileSize ?? item.file.size,
          isBlurred: true, viewerCanDelete: true,
        }]);
        setPendingEvidence((current) => current.filter((candidate) => candidate.id !== item.id));
      } catch {
        if (generation !== uploadGenerationRef.current) return false;
        allUploaded = false;
        setPendingEvidence((current) =>
          current.map((candidate) =>
            candidate.id === item.id ? { ...candidate, status: "failed" } : candidate
          )
        );
      }
    }
    if (generation === uploadGenerationRef.current) {
      uploadBusyRef.current = false;
      setIsUploading(false);
    }
    return allUploaded;
  };

  const retryEvidence = async (evidenceId: string) => {
    if (!persistedPost || uploadBusyRef.current || saveBusyRef.current) return;
    const item = pendingEvidence.find((candidate) => candidate.id === evidenceId);
    if (!item || item.status !== "failed") return;
    const uploaded = await uploadEvidence(persistedPost, [item]);
    if (uploaded && mountedRef.current) toast.success("Preuve ajoutée. Enregistrez vos éventuelles modifications avant de quitter.");
  };

  const submit = form.handleSubmit(async (values) => {
    if (saveBusyRef.current || uploadBusyRef.current) return;
    saveBusyRef.current = true;
    setServerError(null);
    try {
    const authorizedValues = {
      ...values,
      // Never send a moderation-only field from an Editor form, including a
      // retained default value from an existing verified report.
      verificationStatus: mayVerify && !isSensitive ? values.verificationStatus : undefined,
    };
      const response = await fetch(persistedPost ? `/resources/api/posts/${persistedPost.id}/update` : submitUrl, {
        method: persistedPost ? "PATCH" : method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authorizedValues),
      });
      const responsePayload = (await response.json().catch(() => ({}))) as
        | ReportWriteResponse
        | ErrorPayload;
      if (!mountedRef.current) return;

      if (!response.ok || !("success" in responsePayload) || !responsePayload.success) {
        setServerError(
          "Impossible d’enregistrer le rapport. Vos modifications sont conservées dans ce formulaire."
        );
        return;
      }
    const payload = responsePayload;

    const target = {
      id: payload.post.id,
      spaceId: payload.post.spaceId,
      reportedEntityId: payload.post.reportedEntity.id,
    };
    setPersistedPost(target);
    setReviewRequired((current) => current || payload.post.requiresSensitiveReview);
    const uploadItems = pendingEvidence.filter((item) => item.status !== "uploading");
    const uploadsSucceeded = await uploadEvidence(target, uploadItems);
    if (!mountedRef.current) return;
    if (!uploadsSucceeded) {
      toast.error("Le rapport est enregistré. Réessayez uniquement les preuves indiquées.");
      return;
    }
    if (uploadItems.length > 0) toast.success("Rapport et preuves enregistrés en sécurité.");
    navigate(`/dashboard/entities/${target.reportedEntityId}`);
    } catch {
      if (mountedRef.current) setServerError("Connexion interrompue. Vérifiez le rapport avant de renvoyer le formulaire ; vos modifications sont conservées ici.");
    } finally { saveBusyRef.current = false; }
  });

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={submit}>
          <fieldset className="space-y-6" disabled={form.formState.isSubmitting || isUploading}>
          {serverError && (
            <Alert variant="destructive">
              <AlertTitle>Enregistrement impossible</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="spaceId">Espace</Label>
            <select
              id="spaceId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:opacity-60"
              disabled={method === "PATCH" || persistedPost !== null}
              {...form.register("spaceId")}
            >
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>{space.name} · {space.role}</option>
              ))}
            </select>
            <p className="text-sm text-destructive">{form.formState.errors.spaceId?.message}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="entity-name">Personne ou entité signalée</Label>
            <Input
              id="entity-name"
              placeholder="Nom professionnel"
              {...form.register("entity.name")}
            />
            <p className="text-sm text-destructive">{form.formState.errors.entity?.name?.message}</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Identifiants Instagram</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => replaceHandles([...handles, ""])}
              >
                <Plus className="mr-1 h-4 w-4" /> Ajouter
              </Button>
            </div>
            {handles.map((handle, index) => (
              <div className="flex gap-2" key={index}>
                <Input
                  aria-label={`Identifiant Instagram ${index + 1}`}
                  placeholder="@identifiant"
                  value={handle}
                  onChange={(event) => {
                    const nextHandles = [...handles];
                    nextHandles[index] = event.target.value;
                    replaceHandles(nextHandles);
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={handles.length === 1}
                  onClick={() => replaceHandles(handles.filter((_, itemIndex) => itemIndex !== index))}
                  aria-label="Supprimer cet identifiant"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <p className="text-sm text-destructive">
              {form.formState.errors.entity?.handles?.message ||
                form.formState.errors.entity?.handles?.root?.message}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description du signalement</Label>
            <Textarea
              id="description"
              rows={10}
              placeholder="Décrivez précisément les faits et le contexte…"
              {...form.register("description")}
            />
            <div className="flex justify-between text-sm">
              <span className="text-destructive">{form.formState.errors.description?.message}</span>
              <span className="text-muted-foreground">{form.watch("description").length}/10 000</span>
            </div>
          </div>

          <div className="space-y-4 rounded-md border p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="severity">Niveau de sensibilité</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  id="severity"
                  {...form.register("severity")}
                >
                  <option value="">Non classé</option>
                  <option value="low">Faible</option>
                  <option value="medium">Moyen</option>
                  <option value="high">Élevé — avertissement de sécurité</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="verificationStatus">Statut de vérification</Label>
                {isSensitive ? <p className="text-sm text-muted-foreground">Revue interne à trois niveaux requise. Toute modification du contenu ou des preuves invalide les approbations précédentes.</p> : mayVerify ? (
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    id="verificationStatus"
                    {...form.register("verificationStatus")}
                  >
                    <option value="unverified">Non vérifié</option>
                    <option value="pending">Vérification en cours</option>
                    <option value="verified">Vérifié</option>
                    <option value="disputed">Contesté</option>
                  </select>
                ) : (
                  <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                    Non vérifié · modifiable uniquement par la modération
                  </p>
                )}
              </div>
            </div>
            <label className="flex items-start gap-3">
              <Checkbox
                checked={form.watch("isAnonymous")}
                onCheckedChange={(checked) => form.setValue("isAnonymous", checked === true)}
              />
              <span>
                <span className="block text-sm font-medium">Publier anonymement</span>
                <span className="text-sm text-muted-foreground">Votre identité ne sera jamais incluse dans les réponses publiques.</span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <Checkbox
                checked={form.watch("isAdminOnly")}
                onCheckedChange={(checked) => form.setValue("isAdminOnly", checked === true)}
              />
              <span>
                <span className="block text-sm font-medium">Réservé à la modération</span>
                <span className="text-sm text-muted-foreground">Visible uniquement par les administrateurs et modérateurs de l’espace.</span>
              </span>
            </label>
          </div>

          <EvidenceEditor
            existingEvidence={savedEvidence}
            pendingEvidence={pendingEvidence}
            disabled={form.formState.isSubmitting || isUploading}
            onFilesSelected={addEvidenceFiles}
            onRetry={(evidenceId) => void retryEvidence(evidenceId)}
            onDeleted={(id) => setSavedEvidence((current) => current.filter((item) => item.id !== id))}
            onRemovePending={(id) => setPendingEvidence((current) => current.filter((item) => item.id !== id))}
          />

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>Annuler</Button>
            <Button type="submit" disabled={form.formState.isSubmitting || isUploading || spaces.length === 0}>
              {isUploading
                ? "Sécurisation des preuves…"
                : form.formState.isSubmitting
                  ? "Enregistrement…"
                  : submitLabel}
            </Button>
          </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}
