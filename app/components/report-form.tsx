import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useNavigate } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
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
};

type ErrorPayload = { error?: string };

export function ReportForm({
  initialValues,
  method,
  spaces,
  submitLabel,
  submitUrl,
  title,
}: ReportFormProps) {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<CreateReportInput>({
    resolver: zodResolver(createReportSchema) as Resolver<CreateReportInput>,
    defaultValues: initialValues,
  });
  const handles = form.watch("entity.handles");

  const replaceHandles = (nextHandles: string[]) => {
    form.setValue("entity.handles", nextHandles, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const submit = form.handleSubmit(async (values) => {
    setServerError(null);
    const response = await fetch(submitUrl, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json().catch(() => ({}))) as
      | ReportWriteResponse
      | ErrorPayload;

    if (!response.ok || !("success" in payload) || !payload.success) {
      setServerError(
        "error" in payload && payload.error
          ? payload.error
          : "Impossible d’enregistrer le rapport."
      );
      return;
    }

    navigate(`/dashboard/entities/${payload.post.reportedEntity.id}`);
  });

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={submit}>
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
              disabled={method === "PATCH"}
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

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>Annuler</Button>
            <Button type="submit" disabled={form.formState.isSubmitting || spaces.length === 0}>
              {form.formState.isSubmitting ? "Enregistrement…" : submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
