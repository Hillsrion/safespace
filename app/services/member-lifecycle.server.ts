import type { PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { normalizeSpaceRole } from "~/lib/invitations";
import { verifyPassword } from "~/lib/password";
import { processMediaDeletionJobs } from "~/services/media-deletion.server";
import type { MediaStorage } from "~/services/media-storage.server";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

export type ContributionPolicy = "anonymize" | "delete";
export type LifecycleActor = { id: string };

export class MemberLifecycleError extends Error {
  constructor(public readonly status: 403 | 404 | 409, message: string) {
    super(message);
    this.name = "MemberLifecycleError";
  }
}

function forbidden(message: string): never {
  throw new MemberLifecycleError(403, message);
}

function notFound(message: string): never {
  throw new MemberLifecycleError(404, message);
}

function conflict(message: string): never {
  throw new MemberLifecycleError(409, message);
}

async function assertNotLastAdmin(
  tx: TransactionClient,
  spaceId: string,
  role: string
): Promise<void> {
  if (normalizeSpaceRole(role) !== "ADMIN") return;

  const [result] = await tx.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT safespace_private.own_membership_can_leave(${spaceId}::uuid) AS allowed
  `;
  if (!result?.allowed) {
    conflict("A space must retain at least one administrator");
  }
}

async function handleSpaceContributions(
  tx: TransactionClient,
  spaceId: string | null,
  policy: ContributionPolicy
): Promise<string[]> {
  // PostgreSQL derives the actor from the authenticated transaction context.
  // This primitive touches only that actor's data, including rows hidden by
  // suspension or a removed membership, and queues media before any cascade.
  const [result] = await tx.$queryRaw<Array<{ storageKeys: string[] }>>`
    SELECT safespace_private.withdraw_own_contributions(
      ${spaceId}::uuid, ${policy}::text
    ) AS "storageKeys"
  `;
  if (!result || !Array.isArray(result.storageKeys)) {
    throw new Error("Contribution withdrawal did not return a storage cleanup result");
  }
  return result.storageKeys;
}

export async function leaveSpace(
  actor: LifecycleActor,
  input: { spaceId: string; contributionPolicy: ContributionPolicy },
  client: PrismaClient = prisma,
  options: { storage?: MediaStorage } = {}
): Promise<{ spaceId: string; contributionPolicy: ContributionPolicy }> {
  const outcome = await client.$transaction(async (tx) => {
    // Identity and membership are re-read inside the write transaction to
    // prevent a stale session or concurrent role change from authorizing leave.
    const currentUser = await tx.user.findUnique({
      where: { id: actor.id },
      select: { id: true },
    });
    if (!currentUser) forbidden("Authentication is no longer valid");

    const membership = await tx.userSpaceMembership.findUnique({
      where: { userId_spaceId: { userId: actor.id, spaceId: input.spaceId } },
      select: { role: true },
    });
    // Composite-key lookup intentionally never falls back to another space.
    if (!membership) notFound("Membership not found in this space");

    await assertNotLastAdmin(tx, input.spaceId, membership.role);
    const storageKeys = await handleSpaceContributions(
      tx,
      input.spaceId,
      input.contributionPolicy
    );
    await tx.userSpaceMembership.delete({
      where: { userId_spaceId: { userId: actor.id, spaceId: input.spaceId } },
    });
    // The actor survives a leave, so retain an attributable audit event.
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "user_leave",
        targetEntityType: "UserSpaceMembership",
        targetEntityId: actor.id,
        spaceId: input.spaceId,
        details: { contributionPolicy: input.contributionPolicy },
      },
    });

    return {
      result: { spaceId: input.spaceId, contributionPolicy: input.contributionPolicy },
      storageKeys,
    };
  }, { isolationLevel: "Serializable" });
  await processMediaDeletionJobs(outcome.storageKeys, {
    client,
    storage: options.storage,
  });
  return outcome.result;
}

export async function deleteAccount(
  actor: LifecycleActor,
  input: { password: string; contributionPolicy: ContributionPolicy },
  client: PrismaClient = prisma,
  options: { storage?: MediaStorage } = {}
): Promise<{ deletedUserId: string; contributionPolicy: ContributionPolicy }> {
  const outcome = await client.$transaction(async (tx) => {
    const currentUser = await tx.user.findUnique({
      where: { id: actor.id },
      select: { id: true, password: true, isSuperAdmin: true },
    });
    if (!currentUser) forbidden("Authentication is no longer valid");
    if (!(await verifyPassword(input.password, currentUser.password))) {
      forbidden("Password confirmation is invalid");
    }
    if (
      currentUser.isSuperAdmin &&
      (await tx.user.count({ where: { isSuperAdmin: true } })) <= 1
    ) {
      conflict("The platform must retain at least one super-administrator");
    }

    const memberships = await tx.userSpaceMembership.findMany({
      where: { userId: actor.id },
      select: { spaceId: true, role: true },
    });
    for (const membership of memberships) {
      await assertNotLastAdmin(tx, membership.spaceId, membership.role);
    }

    // Space ownership remains mandatory. Blocking avoids cascading content
    // belonging to other members; entity ownership is nullable and detached.
    const createdSpace = await tx.space.findFirst({
      where: { createdBy: actor.id },
      select: { id: true },
    });
    if (createdSpace) {
      conflict(
        "Account owns spaces that must be transferred before deletion"
      );
    }

    const storageKeys = await handleSpaceContributions(tx, null, input.contributionPolicy);
    await tx.userSpaceMembership.deleteMany({ where: { userId: actor.id } });

    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "account_delete",
        targetEntityType: "User",
        targetEntityId: actor.id,
        details: { contributionPolicy: input.contributionPolicy },
      },
    });
    // Retain the audit event but remove its personal identifier before the
    // account is deleted. AuditLog.actorUserId is nullable by design.
    // RLS must not reveal an anonymous audit row after the actor leaves every
    // space. A self-scoped primitive performs this identity-only transition.
    await tx.$queryRaw`SELECT safespace_private.detach_own_audit_identity()`;
    await tx.user.delete({ where: { id: actor.id } });

    return {
      result: { deletedUserId: actor.id, contributionPolicy: input.contributionPolicy },
      storageKeys,
    };
  }, { isolationLevel: "Serializable" });
  await processMediaDeletionJobs(outcome.storageKeys, {
    client,
    storage: options.storage,
  });
  return outcome.result;
}
