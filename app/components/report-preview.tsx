import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Badge } from "~/components/ui/badge";
import type { CreateReportInput } from "~/lib/reports";

export function ReportPreview({ open, onOpenChange, values, savedEvidenceCount, pendingEvidenceCount }: {
  open: boolean; onOpenChange: (open: boolean) => void; values: CreateReportInput;
  savedEvidenceCount: number; pendingEvidenceCount: number;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Aperçu du signalement</DialogTitle>
        <DialogDescription>Cet aperçu reste local. Il n’enregistre ni ne publie le rapport.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div><h2 className="text-lg font-semibold">{values.entity.name}</h2><p className="text-sm text-muted-foreground">{values.entity.handles.map((handle) => `@${handle.replace(/^@/, "")}`).join(" · ")}</p></div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{values.isAnonymous ? "Auteur anonyme" : "Identité de l’auteur visible"}</Badge>
          <Badge variant="outline">{values.isAdminOnly ? "Réservé à la modération" : "Membres autorisés de cet espace"}</Badge>
          {values.severity && <Badge variant={values.severity === "high" ? "destructive" : "secondary"}>Sensibilité {({ low: "faible", medium: "moyenne", high: "élevée" })[values.severity]}</Badge>}
        </div>
        {values.severity === "high" && <p className="text-sm text-destructive">Contenu potentiellement sensible — revue interne à trois niveaux requise.</p>}
        <p className="whitespace-pre-wrap break-words text-sm">{values.description}</p>
        <p className="text-sm text-muted-foreground">{savedEvidenceCount} preuve(s) enregistrée(s) · {pendingEvidenceCount} fichier(s) encore à téléverser. Les preuves restent floutées par défaut dans le rapport.</p>
        <p className="text-xs text-muted-foreground">Les autorisations, la validation et le traitement des médias seront revérifiés lors de l’enregistrement.</p>
      </div>
    </DialogContent>
  </Dialog>;
}
