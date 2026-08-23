import { useState } from "react";
import { useRevalidator } from "react-router";

import { Button } from "~/components/ui/button";

export function SuperAdminSpaceActions({
  description,
  isEmpty,
  name,
  spaceId,
}: {
  description: string | null;
  isEmpty: boolean;
  name: string;
  spaceId: string;
}) {
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const endpoint = `/resources/api/superadmin/spaces/${spaceId}`;

  const request = async (method: "PATCH" | "DELETE", body: object) => {
    setPending(true);
    setError(null);
    const response = await fetch(endpoint, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Opération impossible.");
      return;
    }
    revalidator.revalidate();
  };

  const edit = async () => {
    const nextName = window.prompt("Nouveau nom de l’espace", name)?.trim();
    if (!nextName) return;
    const nextDescription = window.prompt(
      "Nouvelle description (laisser vide pour la supprimer)",
      description ?? ""
    );
    if (nextDescription === null) return;
    await request("PATCH", {
      name: nextName,
      description: nextDescription.trim() || null,
    });
  };

  const remove = async () => {
    const expected = `DELETE ${name}`;
    const confirmation = window.prompt(`Suppression définitive. Saisissez exactement : ${expected}`);
    if (confirmation !== expected) return;
    await request("DELETE", { confirmation });
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={edit}>Modifier</Button>
        <Button size="sm" variant="destructive" disabled={pending || !isEmpty} onClick={remove}>Supprimer</Button>
      </div>
      {!isEmpty && <p className="text-xs text-muted-foreground">La suppression exige un espace vide.</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
