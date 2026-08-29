import type { PrismaClient } from "~/generated/prisma";

import { prisma } from "~/db/client.server";
import { createInviteToken, INVITE_TTL_MS } from "~/lib/invite-token.server";
import type { SpaceInviteInput } from "~/lib/space-invite";
import { getEffectiveSpaceAccess } from "~/services/effective-space-access.server";
import { sendInviteEmail } from "~/services/invite-email.server";

export class SpaceInviteError extends Error {
  constructor(
    public readonly status: 403 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = "SpaceInviteError";
  }
}

function forbidden(message: string): never {
  throw new SpaceInviteError(403, message);
}

function notFound(): never {
  throw new SpaceInviteError(404, "Space not found");
}

function conflict(): never {
  throw new SpaceInviteError(409, "This user is already a member of the space");
}

export async function createSpaceInvite(
  actor: { id: string; firstName: string; lastName: string },
  spaceId: string,
  input: SpaceInviteInput,
  origin: string,
  client: PrismaClient = prisma,
  now = new Date()
) {
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const { rawToken, tokenHash } = createInviteToken();

  const created = await client.$transaction(
    async (tx) => {
      const access = await getEffectiveSpaceAccess(tx, actor.id, spaceId, now);
      if (!access.isSuperAdmin && access.role !== "ADMIN") {
        forbidden("Space administrator rights are required");
      }
      if (input.role === "ADMIN" && !access.isSuperAdmin) {
        forbidden("Only a super-administrator may invite an administrator");
      }

      const space = await tx.space.findUnique({
        where: { id: spaceId },
        select: { id: true, name: true },
      });
      if (!space) notFound();

      const existingMember = await tx.userSpaceMembership.findFirst({
        where: {
          spaceId,
          user: { email: { equals: input.email, mode: "insensitive" } },
        },
        select: { userId: true },
      });
      if (existingMember) conflict();

      await tx.invite.updateMany({
        where: {
          spaceId,
          email: { equals: input.email, mode: "insensitive" },
          isUsed: false,
          expiresAt: { gt: now },
        },
        data: { expiresAt: now },
      });

      const invite = await tx.invite.create({
        data: {
          email: input.email,
          token: tokenHash,
          spaceId,
          roleToAssign: input.role,
          invitedByUserId: actor.id,
          expiresAt,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: "user_invite",
          targetEntityType: "Invite",
          targetEntityId: invite.id,
          spaceId,
          details: {
            email: input.email,
            role: input.role,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });

      return { id: invite.id, spaceName: space.name };
    },
    { isolationLevel: "Serializable" }
  );

  const inviteUrl = `${origin}/auth/register?token=${encodeURIComponent(rawToken)}`;
  const delivery = await sendInviteEmail({
    email: input.email,
    inviteUrl,
    inviterName: `${actor.firstName} ${actor.lastName}`.trim() || "Un administrateur",
    role: input.role,
    spaceName: created.spaceName,
  });

  return {
    id: created.id,
    email: input.email,
    role: input.role,
    expiresAt: expiresAt.toISOString(),
    inviteUrl,
    delivery: delivery.status,
  };
}
