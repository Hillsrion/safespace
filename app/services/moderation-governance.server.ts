import { Prisma, type PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { errors } from "~/lib/api/http-error";
import { normalizeSpaceRole, type SpaceRole } from "~/lib/invitations";
import { getEffectiveSpaceAccess } from "~/services/effective-space-access.server";
import type {
  AppealDecisionInput,
  AppealsQuery,
  CreateAppealInput,
  CreateDisciplineInput,
  RevokeDisciplineInput,
} from "~/lib/moderation-governance";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];
export type GovernanceActor = { id: string };

type Access = { isSuperAdmin: boolean; role: SpaceRole | null };

const ELEVATED: readonly SpaceRole[] = ["MODERATOR", "ADMIN"];

function isPrismaCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function serializable<T>(
  client: PrismaClient,
  operation: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await client.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        throw errors.conflict("An open appeal already exists for this decision");
      }
      if (!isPrismaCode(error, "P2034") || attempt === 3) {
        if (isPrismaCode(error, "P2034")) {
          throw errors.conflict("The governance record changed; retry the request");
        }
        throw error;
      }
    }
  }
  throw new Error("Unreachable transaction retry state");
}

async function currentAccess(
  tx: TransactionClient,
  actor: GovernanceActor,
  spaceId: string
): Promise<Access> {
  const access = await getEffectiveSpaceAccess(tx, actor.id, spaceId);
  return { isSuperAdmin: access.isSuperAdmin, role: access.role };
}

function requireMember(access: Access, notFoundMessage: string) {
  if (!access.isSuperAdmin && access.role === null) throw errors.notFound(notFoundMessage);
}

function requireModerator(access: Access, notFoundMessage: string) {
  requireMember(access, notFoundMessage);
  if (!access.isSuperAdmin && !ELEVATED.includes(access.role!)) {
    throw errors.forbidden("Moderator or administrator rights are required");
  }
}

function roleRank(role: SpaceRole | null): number {
  switch (role) {
    case "ADMIN": return 3;
    case "MODERATOR": return 2;
    case "EDITOR": return 1;
    case "READ_ONLY": return 0;
    default: return -1;
  }
}

function assertMayDiscipline(
  actor: GovernanceActor,
  access: Access,
  targetUserId: string,
  targetRole: SpaceRole
) {
  if (actor.id === targetUserId) throw errors.forbidden("You cannot discipline yourself");
  if (access.isSuperAdmin) return;
  if (roleRank(access.role) <= roleRank(targetRole)) {
    throw errors.forbidden("You cannot discipline an equal or higher-ranked member");
  }
}

function toAppeal(row: {
  id: string; postFlagId: string; reason: string; status: "pending" | "upheld" | "overturned";
  decisionNote: string | null; decidedAt: Date | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: row.id,
    postFlagId: row.postFlagId,
    reason: row.reason,
    status: row.status,
    decisionNote: row.decisionNote,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDiscipline(row: {
  id: string; userId: string | null; kind: "warning" | "restriction" | "suspension";
  level: number; reason: string; status: "active" | "revoked" | "expired";
  expiresAt: Date | null; issuedByUserId: string | null; revokedByUserId: string | null;
  revokedAt: Date | null; revocationReason: string | null; createdAt: Date;
}) {
  const status =
    row.status === "active" && row.expiresAt && row.expiresAt <= new Date()
      ? "expired"
      : row.status;
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    level: row.level,
    reason: row.reason,
    status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    issuedByUserId: row.issuedByUserId,
    revokedByUserId: row.revokedByUserId,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revocationReason: row.revocationReason,
    createdAt: row.createdAt.toISOString(),
  };
}

const APPEAL_SELECT = {
  id: true, postFlagId: true, reason: true, status: true, decisionNote: true,
  decidedAt: true, createdAt: true, updatedAt: true,
} as const;
const DISCIPLINE_SELECT = {
  id: true, userId: true, kind: true, level: true, reason: true, status: true,
  expiresAt: true, issuedByUserId: true, revokedByUserId: true, revokedAt: true,
  revocationReason: true, createdAt: true,
} as const;

export async function createModerationAppeal(
  actor: GovernanceActor,
  spaceId: string,
  input: CreateAppealInput,
  client: PrismaClient = prisma
) {
  return serializable(client, async (tx) => {
    const access = await currentAccess(tx, actor, spaceId);
    requireMember(access, "Moderation decision not found");
    const flag = await tx.postFlag.findFirst({
      where: {
        id: input.flagId,
        flaggerUserId: actor.id,
        post: { spaceId },
      },
      select: { id: true, status: true, postId: true, resolvedAt: true },
    });
    if (!flag) throw errors.notFound("Moderation decision not found");
    if (flag.status !== "rejected") {
      throw errors.conflict("Only rejected flags can be appealed");
    }
    const latestAppeal = await tx.moderationAppeal.findFirst({
      where: { postFlagId: flag.id, filedByUserId: actor.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { status: true, decidedAt: true },
    });
    if (latestAppeal?.status === "pending") {
      throw errors.conflict("An open appeal already exists for this decision");
    }
    if (
      latestAppeal?.decidedAt &&
      (!flag.resolvedAt || flag.resolvedAt <= latestAppeal.decidedAt)
    ) {
      throw errors.conflict("This moderation decision has already been appealed");
    }

    const appeal = await tx.moderationAppeal.create({
      data: { spaceId, postFlagId: flag.id, filedByUserId: actor.id, reason: input.reason },
      select: APPEAL_SELECT,
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "moderation_appeal_create",
        targetEntityType: "ModerationAppeal",
        targetEntityId: appeal.id,
        spaceId,
        details: { postFlagId: flag.id, postId: flag.postId },
      },
    });
    return toAppeal(appeal);
  });
}

export async function listOwnModerationDecisions(
  actor: GovernanceActor,
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    const currentUser = await tx.user.findUnique({
      where: { id: actor.id },
      select: { isSuperAdmin: true },
    });
    if (!currentUser) throw errors.unauthorized("Authentication is no longer valid");
    const spaces = currentUser.isSuperAdmin
      ? await tx.space.findMany({ select: { id: true } })
      : await tx.userSpaceMembership.findMany({
          where: { userId: actor.id },
          select: { spaceId: true },
        });
    const spaceIds = spaces.map((space) =>
      "spaceId" in space ? space.spaceId : space.id
    );
    if (spaceIds.length === 0) return [];

    const flags = await tx.postFlag.findMany({
      where: {
        flaggerUserId: actor.id,
        status: "rejected",
        post: { spaceId: { in: spaceIds } },
      },
      orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        postId: true,
        reason: true,
        resolvedAt: true,
        post: {
          select: {
            reportedEntity: { select: { name: true } },
            space: { select: { id: true, name: true } },
          },
        },
        appeals: {
          where: { filedByUserId: actor.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            status: true,
            decisionNote: true,
            decidedAt: true,
            createdAt: true,
          },
        },
      },
    });

    return flags.map((flag) => ({
      id: flag.id,
      postId: flag.postId,
      reason: flag.reason,
      resolvedAt: flag.resolvedAt?.toISOString() ?? null,
      entityName: flag.post.reportedEntity.name,
      space: flag.post.space,
      latestAppeal: flag.appeals[0]
        ? {
            ...flag.appeals[0],
            decidedAt: flag.appeals[0].decidedAt?.toISOString() ?? null,
            createdAt: flag.appeals[0].createdAt.toISOString(),
          }
        : null,
    }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function listModerationAppeals(
  actor: GovernanceActor,
  spaceId: string,
  query: AppealsQuery,
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    const access = await currentAccess(tx, actor, spaceId);
    requireModerator(access, "Moderation appeals not found");
    if (query.cursor) {
      const cursor = await tx.moderationAppeal.findFirst({
        where: { id: query.cursor, spaceId }, select: { id: true },
      });
      if (!cursor) throw errors.notFound("Appeal cursor not found");
    }
    const rows = await tx.moderationAppeal.findMany({
      where: { spaceId, status: query.status },
      select: {
        ...APPEAL_SELECT,
        // This context belongs only to the elevated queue. Own-appeal creation
        // and decision responses retain the smaller APPEAL_SELECT contract.
        postFlag: { select: {
          reason: true, status: true, resolvedAt: true,
          post: { select: {
            id: true, description: true, status: true, isAdminOnly: true,
            reportedEntity: { select: { name: true } },
          } },
        } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      skip: query.cursor ? 1 : 0,
      cursor: query.cursor ? { id: query.cursor } : undefined,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      appeals: page.map((row) => ({
        ...toAppeal(row),
        originalDecision: {
          reason: row.postFlag.reason,
          status: row.postFlag.status,
          resolvedAt: row.postFlag.resolvedAt?.toISOString() ?? null,
        },
        post: {
          id: row.postFlag.post.id,
          description: row.postFlag.post.description,
          status: row.postFlag.post.status,
          isAdminOnly: row.postFlag.post.isAdminOnly,
          entityName: row.postFlag.post.reportedEntity.name,
        },
      })),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
      hasMore,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function decideModerationAppeal(
  actor: GovernanceActor,
  spaceId: string,
  appealId: string,
  input: AppealDecisionInput,
  client: PrismaClient = prisma
) {
  return serializable(client, async (tx) => {
    const access = await currentAccess(tx, actor, spaceId);
    requireModerator(access, "Moderation appeal not found");
    const current = await tx.moderationAppeal.findFirst({
      where: { id: appealId, spaceId },
      select: { id: true, postFlagId: true, status: true },
    });
    if (!current) throw errors.notFound("Moderation appeal not found");
    if (current.status !== "pending") throw errors.conflict("This appeal has already been decided");

    const decidedAt = new Date();
    const appeal = await tx.moderationAppeal.update({
      where: { id: current.id },
      data: {
        status: input.status,
        decisionNote: input.decisionNote,
        reviewedByUserId: actor.id,
        decidedAt,
      },
      select: APPEAL_SELECT,
    });
    if (input.status === "overturned") {
      await tx.postFlag.update({
        where: { id: current.postFlagId },
        data: { status: "pending_review", resolvedByUserId: null, resolvedAt: null },
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "moderation_appeal_decide",
        targetEntityType: "ModerationAppeal",
        targetEntityId: current.id,
        spaceId,
        details: { previousStatus: current.status, status: input.status, postFlagId: current.postFlagId },
      },
    });
    return toAppeal(appeal);
  });
}

export async function issueProgressiveDiscipline(
  actor: GovernanceActor,
  spaceId: string,
  input: CreateDisciplineInput,
  client: PrismaClient = prisma
) {
  return serializable(client, async (tx) => {
    const access = await currentAccess(tx, actor, spaceId);
    requireModerator(access, "Disciplinary action not found");
    const target = await tx.userSpaceMembership.findUnique({
      where: { userId_spaceId: { userId: input.userId, spaceId } },
      select: { role: true },
    });
    const targetRole = normalizeSpaceRole(target?.role ?? "");
    if (!targetRole) throw errors.notFound("Member not found in this space");
    assertMayDiscipline(actor, access, input.userId, targetRole);

    const previousCount = await tx.disciplinaryAction.count({
      where: { spaceId, userId: input.userId },
    });
    const level = previousCount + 1;
    const kind = level === 1 ? "warning" : level === 2 ? "restriction" : "suspension";
    if (kind !== "warning" && !input.expiresAt) {
      throw errors.badRequest("Restrictions and suspensions require an expiry date");
    }
    if (input.expiresAt && input.expiresAt <= new Date()) {
      throw errors.badRequest("The expiry date must be in the future");
    }

    const action = await tx.disciplinaryAction.create({
      data: {
        spaceId,
        userId: input.userId,
        issuedByUserId: actor.id,
        kind,
        level,
        reason: input.reason,
        expiresAt: kind === "warning" ? null : input.expiresAt,
      },
      select: DISCIPLINE_SELECT,
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "discipline_issue",
        targetEntityType: "DisciplinaryAction",
        targetEntityId: action.id,
        spaceId,
        details: { userId: input.userId, kind, level },
      },
    });
    return toDiscipline(action);
  });
}

export async function revokeDisciplinaryAction(
  actor: GovernanceActor,
  spaceId: string,
  disciplineId: string,
  input: RevokeDisciplineInput,
  client: PrismaClient = prisma
) {
  return serializable(client, async (tx) => {
    const access = await currentAccess(tx, actor, spaceId);
    requireModerator(access, "Disciplinary action not found");
    const current = await tx.disciplinaryAction.findFirst({
      where: { id: disciplineId, spaceId },
      select: { id: true, userId: true, status: true, expiresAt: true },
    });
    if (!current) throw errors.notFound("Disciplinary action not found");
    if (
      current.status !== "active" ||
      (current.expiresAt && current.expiresAt <= new Date())
    ) {
      throw errors.conflict("This disciplinary action is already closed");
    }
    if (current.userId) {
      const target = await tx.userSpaceMembership.findUnique({
        where: { userId_spaceId: { userId: current.userId, spaceId } },
        select: { role: true },
      });
      const targetRole = normalizeSpaceRole(target?.role ?? "");
      if (targetRole) assertMayDiscipline(actor, access, current.userId, targetRole);
    }
    const revokedAt = new Date();
    const action = await tx.disciplinaryAction.update({
      where: { id: current.id },
      data: {
        status: "revoked",
        revokedByUserId: actor.id,
        revokedAt,
        revocationReason: input.revocationReason,
      },
      select: DISCIPLINE_SELECT,
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "discipline_revoke",
        targetEntityType: "DisciplinaryAction",
        targetEntityId: current.id,
        spaceId,
        details: { userId: current.userId },
      },
    });
    return toDiscipline(action);
  });
}

export async function getMemberModerationHistory(
  actor: GovernanceActor,
  spaceId: string,
  userId: string,
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    const access = await currentAccess(tx, actor, spaceId);
    requireModerator(access, "Member history not found");
    const membership = await tx.userSpaceMembership.findUnique({
      where: { userId_spaceId: { userId, spaceId } }, select: { role: true },
    });
    if (!membership) throw errors.notFound("Member history not found");
    const user = await tx.user.findUnique({
      // Moderators need identity sufficient to distinguish members, not direct
      // contact details or social handles.
      where: { id: userId }, select: { id: true, firstName: true, lastName: true },
    });
    if (!user) throw errors.notFound("Member history not found");
    const [discipline, appeals, auditEvents] = await Promise.all([
      tx.disciplinaryAction.findMany({
        where: { spaceId, userId }, select: DISCIPLINE_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
      }),
      tx.moderationAppeal.findMany({
        where: { spaceId, filedByUserId: userId }, select: APPEAL_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
      }),
      tx.auditLog.findMany({
        where: {
          spaceId,
          OR: [{ actorUserId: userId }, { targetEntityId: userId }],
        },
        // Audit details can contain invitation addresses and other operational
        // metadata. Expose only the event taxonomy in member history.
        select: { id: true, action: true, targetEntityType: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
      }),
    ]);
    return {
      member: { ...user, role: normalizeSpaceRole(membership.role) },
      disciplinaryActions: discipline.map(toDiscipline),
      appeals: appeals.map(toAppeal),
      auditEvents: auditEvents.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
