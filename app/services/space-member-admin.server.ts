import type { PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { normalizeSpaceRole, type SpaceRole } from "~/lib/invitations";
import { getEffectiveSpaceAccess } from "~/services/effective-space-access.server";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

export type MembershipAdminActor = {
  id: string;
};

export class MembershipAdminError extends Error {
  constructor(
    public readonly status: 403 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = "MembershipAdminError";
  }
}

function forbidden(message: string): never {
  throw new MembershipAdminError(403, message);
}

function notFound(message: string): never {
  throw new MembershipAdminError(404, message);
}

function conflict(message: string): never {
  throw new MembershipAdminError(409, message);
}

async function requireCurrentAdministrator(
  tx: TransactionClient,
  actor: MembershipAdminActor,
  spaceId: string
): Promise<{ isSuperAdmin: boolean }> {
  const access = await getEffectiveSpaceAccess(tx, actor.id, spaceId);
  if (!access.isSuperAdmin && access.role !== "ADMIN") {
    forbidden("Space administrator rights are required");
  }

  return { isSuperAdmin: access.isSuperAdmin };
}

async function requireSpaceMember(
  tx: TransactionClient,
  spaceId: string,
  userId: string
): Promise<{ role: SpaceRole }> {
  const membership = await tx.userSpaceMembership.findUnique({
    where: { userId_spaceId: { userId, spaceId } },
    select: { role: true },
  });
  const role = normalizeSpaceRole(membership?.role ?? "");

  // Querying the composite key prevents a member of another space from being
  // selected or changed through this endpoint.
  if (!membership) notFound("Member not found in this space");
  if (!role) conflict("Member role is invalid");
  return { role };
}

async function assertNotLastAdmin(
  tx: TransactionClient,
  spaceId: string,
  targetRole: SpaceRole
): Promise<void> {
  if (targetRole !== "ADMIN") return;

  const memberships = await tx.userSpaceMembership.findMany({
    where: { spaceId },
    select: { role: true },
  });
  const adminCount = memberships.filter(
    (membership) => normalizeSpaceRole(membership.role) === "ADMIN"
  ).length;

  if (adminCount <= 1) {
    conflict("A space must retain at least one administrator");
  }
}

function assertAdminMayManage(
  actor: { isSuperAdmin: boolean },
  targetRole: SpaceRole,
  nextRole?: SpaceRole
): void {
  if (actor.isSuperAdmin) return;

  // A space admin can manage ordinary members only. In particular, it cannot
  // grant ADMIN nor demote/remove an existing ADMIN membership.
  if (targetRole === "ADMIN" || nextRole === "ADMIN") {
    forbidden("Only a super-administrator may manage administrator roles");
  }
}

async function requireSpace(tx: TransactionClient, spaceId: string): Promise<void> {
  const space = await tx.space.findUnique({
    where: { id: spaceId },
    select: { id: true },
  });
  if (!space) notFound("Space not found");
}

export async function changeSpaceMemberRole(
  actor: MembershipAdminActor,
  input: { spaceId: string; userId: string; role: SpaceRole },
  client: PrismaClient = prisma
): Promise<{ userId: string; spaceId: string; role: SpaceRole }> {
  return client.$transaction(async (tx) => {
    await requireSpace(tx, input.spaceId);
    const currentActor = await requireCurrentAdministrator(tx, actor, input.spaceId);
    const target = await requireSpaceMember(tx, input.spaceId, input.userId);

    assertAdminMayManage(currentActor, target.role, input.role);
    if (target.role === input.role) conflict("Member already has this role");
    await assertNotLastAdmin(tx, input.spaceId, target.role);

    await tx.userSpaceMembership.update({
      where: { userId_spaceId: { userId: input.userId, spaceId: input.spaceId } },
      data: { role: input.role },
    });
    // The mutation and audit record deliberately share this transaction.
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "user_role_change",
        targetEntityType: "UserSpaceMembership",
        targetEntityId: input.userId,
        spaceId: input.spaceId,
        details: { previousRole: target.role, role: input.role },
      },
    });

    return { userId: input.userId, spaceId: input.spaceId, role: input.role };
  }, { isolationLevel: "Serializable" });
}

export async function kickSpaceMember(
  actor: MembershipAdminActor,
  input: { spaceId: string; userId: string },
  client: PrismaClient = prisma
): Promise<{ userId: string; spaceId: string }> {
  return client.$transaction(async (tx) => {
    await requireSpace(tx, input.spaceId);
    const currentActor = await requireCurrentAdministrator(tx, actor, input.spaceId);
    const target = await requireSpaceMember(tx, input.spaceId, input.userId);

    assertAdminMayManage(currentActor, target.role);
    await assertNotLastAdmin(tx, input.spaceId, target.role);

    await tx.userSpaceMembership.delete({
      where: { userId_spaceId: { userId: input.userId, spaceId: input.spaceId } },
    });
    // Kept in the same serializable transaction as the deletion.
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "user_kick",
        targetEntityType: "UserSpaceMembership",
        targetEntityId: input.userId,
        spaceId: input.spaceId,
        details: { role: target.role },
      },
    });

    return { userId: input.userId, spaceId: input.spaceId };
  }, { isolationLevel: "Serializable" });
}
