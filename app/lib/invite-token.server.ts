import { createHash, randomBytes } from "node:crypto";

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createInviteToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashInviteToken(rawToken) };
}

/**
 * The raw candidate keeps links created before token hashing deployable during
 * the transition. Newly created invitations are always stored as hashes.
 */
export function getInviteTokenCandidates(token: string): string[] {
  const normalized = token.trim();
  return [...new Set([hashInviteToken(normalized), normalized])];
}
