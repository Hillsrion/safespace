import type { PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { normalizeSpaceRole } from "~/lib/invitations";
import { verifyPassword } from "~/lib/password";
import {
  enqueueMediaDeletionForWhere,
  processMediaDeletionJobs,
} from "~/services/media-deletion.server";
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
  userId: string,
  spaceId: string,
  role: string
): Promise<void> {
  if (normalizeSpaceRole(role) !== "ADMIN") return;

  const memberships = await tx.userSpaceMembership.findMany({
    where: { spaceId },
    select: { userId: true, role: true },
  });
  const adminCount = memberships.filter(
    (membership) => normalizeSpaceRole(membership.role) === "ADMIN"
  ).length;
  if (adminCount <= 1) {
    conflict("A space must retain at least one administrator");
  }
}

async function handleSpaceContributions(
  tx: TransactionClient,
  userId: string,
  spaceId: string,
  policy: ContributionPolicy
): Promise<string[]> {
  const storageKeys = await enqueueMediaDeletionForWhere(
    tx,
    policy === "delete"
      ? {
          OR: [
            { post: { authorId: userId, spaceId } },
            { uploaderId: userId, post: { spaceId } },
          ],
        }
      : { uploaderId: userId, post: { spaceId } },
    { requestedByUserId: userId }
  );
  if (policy === "delete") {
    await tx.post.deleteMany({ where: { authorId: userId, spaceId } });
  } else {
    // Preserving a report must not preserve its author's identity.
    await tx.post.updateMany({
      where: { authorId: userId, spaceId },
      data: { authorId: null, isAnonymous: true },
    });
  }

  // Media.uploaderId is mandatory (ON DELETE RESTRICT). It cannot be safely
  // detached, so account/space departure removes the actor's uploaded media.
  await tx.media.deleteMany({
    where: { uploaderId: userId, post: { spaceId } },
  });
  await tx.postFlag.deleteMany({
    where: { flaggerUserId: userId, post: { spaceId } },
  });
  await tx.postFlag.updateMany({
    where: { resolvedByUserId: userId, post: { spaceId } },
    data: { resolvedByUserId: null },
  });
  return storageKeys;
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

    await assertNotLastAdmin(tx, actor.id, input.spaceId, membership.role);
    const storageKeys = await handleSpaceContributions(
      tx,
      actor.id,
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
      await assertNotLastAdmin(tx, actor.id, membership.spaceId, membership.role);
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

    const storageKeys = await enqueueMediaDeletionForWhere(
      tx,
      input.contributionPolicy === "delete"
        ? { OR: [{ post: { authorId: actor.id } }, { uploaderId: actor.id }] }
        : { uploaderId: actor.id },
      { requestedByUserId: actor.id }
    );

    if (input.contributionPolicy === "delete") {
      await tx.post.deleteMany({ where: { authorId: actor.id } });
    } else {
      await tx.post.updateMany({
        where: { authorId: actor.id },
        data: { authorId: null, isAnonymous: true },
      });
    }

    await tx.media.deleteMany({ where: { uploaderId: actor.id } });
    await tx.postFlag.deleteMany({ where: { flaggerUserId: actor.id } });
    await tx.postFlag.updateMany({
      where: { resolvedByUserId: actor.id },
      data: { resolvedByUserId: null },
    });
    // Invites reference their sender with ON DELETE RESTRICT, so they must be
    // invalidated/removed before deleting the user.
    await tx.invite.deleteMany({ where: { invitedByUserId: actor.id } });
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
    await tx.auditLog.updateMany({
      where: { actorUserId: actor.id },
      data: { actorUserId: null },
    });
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
