import { useState } from "react";
import { useRevalidator } from "react-router";

import { Button } from "~/components/ui/button";

export function ModerationFlagActions({
  flagId,
  spaceId,
}: {
  flagId: string;
  spaceId: string;
}) {
  const revalidator = useRevalidator();
  const [pending, setPending] = useState<"resolved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (status: "resolved" | "rejected") => {
    setPending(status);
    setError(null);
    const response = await fetch(
      `/resources/api/spaces/${spaceId}/moderation/flags/${flagId}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    setPending(null);
    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Décision impossible.");
      return;
    }
    revalidator.revalidate();
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="sm" disabled={pending !== null} onClick={() => decide("resolved")}>Résoudre</Button>
        <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => decide("rejected")}>Rejeter</Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
