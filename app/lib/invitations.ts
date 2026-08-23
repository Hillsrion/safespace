export const SPACE_ROLES = [
  "ADMIN",
  "MODERATOR",
  "EDITOR",
  "READ_ONLY",
] as const;

export type SpaceRole = (typeof SPACE_ROLES)[number];

export function normalizeSpaceRole(role: string): SpaceRole | null {
  const normalized = role.trim().toUpperCase().replaceAll("-", "_");
  return SPACE_ROLES.includes(normalized as SpaceRole)
    ? (normalized as SpaceRole)
    : null;
}

type InviteCandidate = {
  email: string;
  isUsed: boolean;
  expiresAt: Date;
};

export function isInviteEligible(
  invite: InviteCandidate | null,
  email: string,
  now: Date
): invite is InviteCandidate {
  return Boolean(
    invite &&
      !invite.isUsed &&
      invite.expiresAt > now &&
      invite.email.trim().toLowerCase() === email.trim().toLowerCase()
  );
}
