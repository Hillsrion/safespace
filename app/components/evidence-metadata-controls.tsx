import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { EVIDENCE_CATEGORIES, EVIDENCE_CATEGORY_LABELS } from "~/lib/evidence";

export function EvidenceMetadataControls({ id, category = "unclassified", caption = null, disabled, onSave }: {
  id: string; category?: string; caption?: string | null; disabled: boolean;
  onSave: (patch: { evidenceCategory: string; caption: string | null }) => void;
}) {
  const [draftCategory, setDraftCategory] = useState(category);
  const [draftCaption, setDraftCaption] = useState(caption ?? "");
  useEffect(() => { setDraftCategory(category); setDraftCaption(caption ?? ""); }, [id, category, caption]);
  const changed = draftCategory !== category || (draftCaption.trim() || null) !== caption;
  return <div className="grid gap-2">
    <Label htmlFor={`evidence-category-${id}`}>Catégorie</Label>
    <select id={`evidence-category-${id}`} value={draftCategory} disabled={disabled} onChange={(event) => setDraftCategory(event.target.value)} className="h-9 rounded border bg-background px-2 text-sm">
      {EVIDENCE_CATEGORIES.map((value) => <option key={value} value={value}>{EVIDENCE_CATEGORY_LABELS[value]}</option>)}
    </select>
    <Label htmlFor={`evidence-caption-${id}`}>Légende</Label>
    <Input id={`evidence-caption-${id}`} maxLength={280} value={draftCaption} disabled={disabled} onChange={(event) => setDraftCaption(event.target.value)} />
    <p className="text-xs text-muted-foreground">Évitez les coordonnées et identités inutiles dans la légende.</p>
    <Button type="button" size="sm" variant="outline" disabled={disabled || !changed} onClick={() => onSave({ evidenceCategory: draftCategory, caption: draftCaption.trim() || null })}>Enregistrer la classification</Button>
  </div>;
}
