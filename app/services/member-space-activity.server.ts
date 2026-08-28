import type { PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { getDbContext } from "~/db/context.server";
import { getEffectiveSpaceAccess } from "~/services/effective-space-access.server";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

export type MemberSpaceActivityResult = { recorded: boolean };

export class MemberSpaceActivityContextError extends Error {
  constructor() {
    super("Member activity must be recorded for the authenticated user");
    this.name = "MemberSpaceActivityContextError";
  }
}

async function hasActiveOwnMembership(
  tx: TransactionClient,
  actorId: string,
  spaceId: string
): Promise<boolean> {
  const access = await getEffectiveSpaceAccess(tx, actorId, spaceId);
  if (access.discipline === "suspension") return false;

  // Super-admin access is global, but this aggregate is specifically about a
  // member's own space activity. Require the durable membership in all cases.
  const membership = await tx.userSpaceMembership.findUnique({
    where: { userId_spaceId: { userId: actorId, spaceId } },
    select: { userId: true },
  });
  if (!membership) return false;

  if (!access.isSuperAdmin) return access.role !== null;

  // getEffectiveSpaceAccess intentionally treats super-admin as break-glass
  // access. The RLS write policy still rejects a suspended membership, so read
  // the discipline explicitly to preserve the same invariant before writing.
  const suspension = await tx.disciplinaryAction.findFirst({
    where: {
      userId: actorId,
      spaceId,
      status: "active",
      kind: "suspension",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  return !suspension;
}

/**
 * Store at most one current UTC calendar day for the authenticated member in
 * one explicitly visited space. Loss of access is deliberately a no-op, which
 * keeps this optional aggregate from changing page-read behavior.
 */
export async function recordMemberSpaceActivity(
  actorId: string,
  spaceId: string,
  client: PrismaClient = prisma
): Promise<MemberSpaceActivityResult> {
  const context = getDbContext();
  if (context?.mode !== "user" || context.userId !== actorId) {
    throw new MemberSpaceActivityContextError();
  }

  return client.$transaction(async (tx) => {
    if (!(await hasActiveOwnMembership(tx, actorId, spaceId))) {
      return { recorded: false };
    }

    // This is one atomic, database-clocked operation: conflict updates happen
    // only when the stored UTC day differs. The trigger still overwrites the
    // supplied date, so neither application time nor caller input is trusted.
    const affectedRows = await tx.$executeRaw`
      INSERT INTO public."MemberSpaceActivity" ("userId", "spaceId", "lastActiveDay")
      VALUES (
        ${actorId}::uuid,
        ${spaceId}::uuid,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
      )
      ON CONFLICT ("userId", "spaceId") DO UPDATE
        SET "lastActiveDay" = EXCLUDED."lastActiveDay"
        WHERE "MemberSpaceActivity"."lastActiveDay"
          IS DISTINCT FROM EXCLUDED."lastActiveDay"
    `;

    return { recorded: affectedRows > 0 };
  });
}
