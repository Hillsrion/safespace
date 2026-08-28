export type ModerationTemplateCategory = "discipline" | "appeal" | "review";
export const MODERATION_TEMPLATES: Record<ModerationTemplateCategory, Array<{ id: string; label: string; text: string }>> = {
  discipline: [
    { id: "rule", label: "Rappel d’une règle", text: "Règle concernée : [à compléter]\nComportement observé, sans données identifiantes : [à compléter]\nChangement attendu et suite proposée : [à compléter]" },
    { id: "privacy", label: "Protection de la confidentialité", text: "Risque de divulgation constaté, sans recopier les données : [à compléter]\nCorrection attendue : [à compléter]\nDurée et conditions de réexamen : [à compléter]" },
  ],
  appeal: [
    { id: "second-review", label: "Réponse à une demande de seconde revue", text: "Éléments réexaminés : [à compléter]\nMotif de la décision, sans identifier les personnes : [à compléter]\nSuite à donner : [à compléter]" },
  ],
  review: [
    { id: "evidence", label: "Examen des éléments et incertitudes", text: "Éléments examinés : [à compléter]\nLimites et incertitudes : [à compléter]\nJustification de l’étape ou correction demandée : [à compléter]" },
  ],
};

export function hasUnfilledModerationTemplate(value: string): boolean {
  return /\[à compléter\]/i.test(value);
}
