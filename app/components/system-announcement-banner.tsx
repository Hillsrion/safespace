import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";

export type SystemAnnouncementView = {
  id: string;
  content: string;
  publishedAt: string;
  expiresAt: string | null;
  updatedAt: string;
};

const dismissedKey = ({ id, updatedAt }: Pick<SystemAnnouncementView, "id" | "updatedAt">) => `safespace:announcement-dismissed:${id}:${updatedAt}`;
function isDismissed(announcement: SystemAnnouncementView) {
  try { return localStorage.getItem(dismissedKey(announcement)) === "1"; } catch { return false; }
}

export function SystemAnnouncementBanner({ announcements }: { announcements: SystemAnnouncementView[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDismissed(new Set(announcements.filter(isDismissed).map(({ id }) => id)));
  }, [announcements]);

  const visible = announcements.filter(({ id }) => !dismissed.has(id));
  if (visible.length === 0) return null;

  return (
    <div aria-label="Annonces système" className="mb-4 space-y-2">
      {visible.map((announcement) => (
        <div className="flex items-start justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm" key={announcement.id}>
          <p className="whitespace-pre-wrap">{announcement.content}</p>
          <Button aria-label="Masquer cette annonce sur cet appareil" className="shrink-0" onClick={() => {
            try { localStorage.setItem(dismissedKey(announcement), "1"); } catch { /* dismissal remains in memory */ }
            setDismissed((current) => new Set(current).add(announcement.id));
          }} size="sm" variant="ghost">Masquer</Button>
        </div>
      ))}
    </div>
  );
}
