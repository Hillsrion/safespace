/** Calendar days in UTC, never an exact observation timestamp. */
export function activityWindow(now = new Date()) {
  const through = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since = new Date(through);
  since.setUTCDate(since.getUTCDate() - 6);
  return { since, through };
}

export function activityDayLabel(day: Date | string | null | undefined) {
  if (!day) return "Aucune activité enregistrée";
  const date = new Date(day);
  if (!Number.isFinite(date.getTime())) return "Date indisponible";
  return date.toLocaleDateString("fr-FR", { timeZone: "UTC" });
}
