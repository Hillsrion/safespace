import { useState } from "react";
import { useRevalidator } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import type { SystemAnnouncementView } from "~/components/system-announcement-banner";

function localDateTime(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}
function toIso(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error("Indiquez une date valide.");
  return date.toISOString();
}

export function SystemAnnouncementManager({ announcements }: { announcements: SystemAnnouncementView[] }) {
  const revalidator = useRevalidator();
  const [content, setContent] = useState("");
  const [publishedAt, setPublishedAt] = useState(() => localDateTime());
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const request = async (url: string, method: "POST" | "PATCH" | "DELETE", body?: object) => {
    setPending(true); setError(null);
    try {
      const response = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(typeof payload.error === "string" ? payload.error : "Opération impossible."); return false; }
      revalidator.revalidate();
      return true;
    } catch { setError("Opération non confirmée. Vérifiez votre connexion, puis réessayez."); return false; }
    finally { setPending(false); }
  };
  const reset = () => { setEditingId(null); setContent(""); setPublishedAt(localDateTime()); setExpiresAt(""); setError(null); };
  const save = async () => {
    let payload: { content: string; publishedAt: string; expiresAt: string | null };
    try {
      payload = { content, publishedAt: toIso(publishedAt), expiresAt: expiresAt ? toIso(expiresAt) : null };
      if (payload.expiresAt && new Date(payload.expiresAt) <= new Date(payload.publishedAt)) throw new Error("L’expiration doit suivre la publication.");
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Date invalide."); return; }
    const saved = await request(editingId ? `/resources/api/superadmin/announcements/${editingId}` : "/resources/api/superadmin/announcements", editingId ? "PATCH" : "POST", payload);
    if (saved) reset();
  };
  const edit = (announcement: SystemAnnouncementView) => {
    if (content.trim() && !window.confirm("Remplacer le brouillon actuel par cette annonce ?")) return;
    setEditingId(announcement.id); setContent(announcement.content);
    setPublishedAt(localDateTime(new Date(announcement.publishedAt)));
    setExpiresAt(announcement.expiresAt ? localDateTime(new Date(announcement.expiresAt)) : "");
    setError(null);
  };
  const remove = async (announcement: SystemAnnouncementView) => {
    if (!window.confirm("Supprimer définitivement cette annonce ?")) return;
    const removed = await request(`/resources/api/superadmin/announcements/${announcement.id}`, "DELETE");
    if (removed && editingId === announcement.id) reset();
  };

  return <div className="space-y-6">
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={pending} className="grid gap-3 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">{editingId ? "Modifier l’annonce" : "Nouvelle annonce"}</legend>
        <Textarea aria-label="Texte de l’annonce" required maxLength={4000} onChange={(event) => setContent(event.target.value)} placeholder="Annonce système en texte brut" value={content} />
        <div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Publication (heure locale)<Input aria-label="Date de publication" required onChange={(event) => setPublishedAt(event.target.value)} type="datetime-local" value={publishedAt} /></label><label className="text-sm">Expiration facultative (heure locale)<Input aria-label="Date d’expiration" onChange={(event) => setExpiresAt(event.target.value)} type="datetime-local" value={expiresAt} /></label></div>
        <Button disabled={pending || !content.trim()} type="submit">{editingId ? "Enregistrer les modifications" : "Publier l’annonce"}</Button>
        {editingId && <Button type="button" variant="outline" onClick={reset}>Annuler la modification</Button>}
      </fieldset>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="space-y-3">
      {announcements.map((announcement) => <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-4" key={announcement.id}>
        <div><p className="whitespace-pre-wrap text-sm">{announcement.content}</p><p className="mt-2 text-xs text-muted-foreground">Publication : {new Date(announcement.publishedAt).toLocaleString("fr-FR")} · Expiration : {announcement.expiresAt ? new Date(announcement.expiresAt).toLocaleString("fr-FR") : "aucune"}</p></div>
        <div className="flex gap-2"><Button disabled={pending} onClick={() => edit(announcement)} size="sm" variant="outline">Modifier</Button><Button disabled={pending} onClick={() => remove(announcement)} size="sm" variant="destructive">Supprimer</Button></div>
      </div>)}
      {announcements.length === 0 && <p className="text-sm text-muted-foreground">Aucune annonce.</p>}
    </div>
  </div>;
}
