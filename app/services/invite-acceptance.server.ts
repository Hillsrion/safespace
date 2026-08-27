import type { PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { runWithDbContext } from "~/db/context.server";
import { getInviteTokenCandidates } from "~/lib/invite-token.server";
import { isInviteEligible, normalizeSpaceRole } from "~/lib/invitations";

export class InvalidInviteError extends Error {}

/** Identity must come from a current authenticated session/password check. */
export async function acceptInvitationForExistingUser(
  actor: { id: string; email: string },
  rawToken: string,
  client: PrismaClient = prisma
): Promise<{ spaceId: string }> {
  const email = actor.email.trim().toLowerCase();
  const inviteTokens = getInviteTokenCandidates(rawToken);
  return runWithDbContext({ mode: "registration", email, inviteTokens }, () =>
    client.$transaction(async (tx) => {
      // Registration RLS exposes only the matching email and the supplied
      // invitation. Re-reading protects an email change/account deletion race.
      const user = await tx.user.findUnique({ where: { id: actor.id }, select: { id: true, email: true } });
      if (!user || user.email.toLowerCase() !== email) throw new InvalidInviteError();
      const invite = await tx.invite.findFirst({ where: { token: { in: inviteTokens } } });
      const now = new Date();
      if (!isInviteEligible(invite, email, now)) throw new InvalidInviteError();
      const role = normalizeSpaceRole(invite.roleToAssign);
      if (!role) throw new InvalidInviteError();
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, isUsed: false, expiresAt: { gt: now } },
        data: { isUsed: true },
      });
      if (claimed.count !== 1) throw new InvalidInviteError();
      // Only after claiming does registration RLS permit membership access.
      // Never upgrade an existing membership through a second invitation.
      const membership = await tx.userSpaceMembership.findUnique({
        where: { userId_spaceId: { userId: user.id, spaceId: invite.spaceId } }, select: { userId: true },
      });
      if (membership) throw new InvalidInviteError();
      await tx.userSpaceMembership.create({ data: { userId: user.id, spaceId: invite.spaceId, role } });
      return { spaceId: invite.spaceId };
    })
  );
}
