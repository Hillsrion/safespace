import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";

import { Button } from "~/components/ui/button";

const ROLES = ["READ_ONLY", "EDITOR", "MODERATOR", "ADMIN"] as const;

type MemberAdminActionsProps = {
  currentRole: string;
  isSuperAdmin: boolean;
  memberName: string;
  spaceId: string;
  userId: string;
};

export function MemberAdminActions({
  currentRole,
  isSuperAdmin,
  memberName,
  spaceId,
  userId,
}: MemberAdminActionsProps) {
  const normalizedCurrentRole = currentRole.trim().toUpperCase().replaceAll("-", "_");
  const revalidator = useRevalidator();
  const [role, setRole] = useState(normalizedCurrentRole);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"role" | "kick" | null>(null);
  const mayManage = isSuperAdmin || normalizedCurrentRole !== "ADMIN";
  const baseUrl = `/resources/api/spaces/${spaceId}/members/${userId}`;

  useEffect(() => setRole(normalizedCurrentRole), [normalizedCurrentRole]);

  const changeRole = async () => {
    setError(null);
    setPendingAction("role");
    const response = await fetch(`${baseUrl}/role`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const payload = await response.json().catch(() => ({}));
    setPendingAction(null);
    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Modification impossible.");
      return;
    }
    revalidator.revalidate();
  };

  const kick = async () => {
    if (!window.confirm(`Retirer ${memberName} de cet espace ? Ses contributions seront conservées.`)) {
      return;
    }
    setError(null);
    setPendingAction("kick");
    const response = await fetch(`${baseUrl}/kick`, {
      method: "DELETE",
      credentials: "include",
    });
    const payload = await response.json().catch(() => ({}));
    setPendingAction(null);
    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Exclusion impossible.");
      return;
    }
    revalidator.revalidate();
  };

  if (!mayManage) {
    return <span className="text-xs text-muted-foreground">Protégé</span>;
  }

  return (
    <div className="min-w-64 space-y-2">
      <div className="flex gap-2">
        <select
          aria-label={`Rôle de ${memberName}`}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          {ROLES.filter((candidate) => isSuperAdmin || candidate !== "ADMIN").map((candidate) => (
            <option key={candidate} value={candidate}>{candidate}</option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pendingAction !== null || role === normalizedCurrentRole}
          onClick={changeRole}
        >
          Enregistrer
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pendingAction !== null}
          onClick={kick}
        >
          Retirer
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
