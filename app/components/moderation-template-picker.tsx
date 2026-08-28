import { useId, useState } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { MODERATION_TEMPLATES, type ModerationTemplateCategory } from "~/lib/moderation-templates";

export function ModerationTemplatePicker({ category, value, onChange, disabled = false }: {
  category: ModerationTemplateCategory; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const templates = MODERATION_TEMPLATES[category];
  const [selected, setSelected] = useState(templates[0].id);
  const template = templates.find((item) => item.id === selected) ?? templates[0];
  const combined = value.trim() ? `${value}\n\n${template.text}` : template.text;
  return <div className="space-y-2 rounded-md bg-muted p-3">
    <Label htmlFor={id}>Modèle de communication</Label>
    <div className="flex flex-wrap gap-2">
      <select id={id} className="h-9 max-w-full rounded-md border bg-background px-2 text-sm" value={selected} disabled={disabled} onChange={(event) => setSelected(event.target.value)}>
        {templates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <Button type="button" variant="outline" size="sm" disabled={disabled || combined.length > 2_000} onClick={() => onChange(combined)}>Ajouter au brouillon</Button>
    </div>
    <p className="text-xs text-muted-foreground">Complétez chaque champ puis relisez. Aucun envoi ni décision automatique ; votre texte existant est conservé.</p>
    {combined.length > 2_000 && <p className="text-xs text-destructive">Le modèle dépasserait la limite de 2 000 caractères.</p>}
  </div>;
}
