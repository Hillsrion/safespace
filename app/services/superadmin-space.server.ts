import { Prisma, type PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import type {
  AdminSpaceListQuery,
  AuditLogQuery,
  CreateAdminSpaceInput,
  UpdateAdminSpaceInput,
} from "~/lib/superadmin-spaces";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

export type SuperAdminActor = { id: string };

export class SuperAdminSpaceError extends Error {
  constructor(
    public readonly status: 403 | 404 | 409,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "SuperAdminSpaceError";
  }
}

const SPACE_SELECT = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      memberships: true,
      posts: true,
      invites: true,
      reportedEntities: true,
    },
  },
} as const;

type SelectedSpace = {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    memberships: number;
    posts: number;
    invites: number;
    reportedEntities: number;
  };
};

function forbidden(message: string): never {
  throw new SuperAdminSpaceError(403, message);
}

function notFound(message: string): never {
  throw new SuperAdminSpaceError(404, message);
}

function conflict(message: string, details?: unknown): never {
  throw new SuperAdminSpaceError(409, message, details);
}

async function requireCurrentSuperAdmin(
  tx: TransactionClient,
  actor: SuperAdminActor
): Promise<void> {
  // Session data is only an identity claim. Re-read the authorization flag in
  // the same database operation that serves or mutates admin data.
  const currentActor = await tx.user.findUnique({
    where: { id: actor.id },
    select: { isSuperAdmin: true },
  });
  if (!currentActor?.isSuperAdmin) {
    forbidden("Current super-administrator rights are required");
  }
}

function toSpaceResponse(space: SelectedSpace) {
  return {
    id: space.id,
    name: space.name,
    description: space.description,
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
    counts: {
      members: space._count.memberships,
      posts: space._count.posts,
      invites: space._count.invites,
      reportedEntities: space._count.reportedEntities,
    },
  };
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function runSerializable<T>(
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
        conflict("A space with this name already exists");
      }
      if (!isPrismaCode(error, "P2034")) throw error;
      if (attempt === 3) conflict("The space changed concurrently; retry the request");
    }
  }
  throw new Error("Unreachable transaction retry state");
}

export async function listAdminSpaces(
  actor: SuperAdminActor,
  query: AdminSpaceListQuery,
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    await requireCurrentSuperAdmin(tx, actor);
    const rows = await tx.space.findMany({
      select: SPACE_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      skip: query.cursor ? 1 : 0,
      cursor: query.cursor ? { id: query.cursor } : undefined,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      spaces: page.map(toSpaceResponse),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
      hasMore,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function getAdminSpace(
  actor: SuperAdminActor,
  spaceId: string,
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    await requireCurrentSuperAdmin(tx, actor);
    const space = await tx.space.findUnique({
      where: { id: spaceId },
      select: SPACE_SELECT,
    });
    if (!space) notFound("Space not found");
    return toSpaceResponse(space);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function createAdminSpace(
  actor: SuperAdminActor,
  input: CreateAdminSpaceInput,
  client: PrismaClient = prisma
) {
  return runSerializable(client, async (tx) => {
    await requireCurrentSuperAdmin(tx, actor);
    const space = await tx.space.create({
      data: {
        name: input.name,
        description: input.description,
        createdBy: actor.id,
      },
      select: SPACE_SELECT,
    });
    // SuperAdmins have global access, so no synthetic membership is needed.
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "space_create",
        targetEntityType: "Space",
        targetEntityId: space.id,
        spaceId: space.id,
      },
    });
    return toSpaceResponse(space);
  });
}

export async function updateAdminSpace(
  actor: SuperAdminActor,
  spaceId: string,
  input: UpdateAdminSpaceInput,
  client: PrismaClient = prisma
) {
  return runSerializable(client, async (tx) => {
    await requireCurrentSuperAdmin(tx, actor);
    const current = await tx.space.findUnique({
      where: { id: spaceId },
      select: { id: true, name: true, description: true },
    });
    if (!current) notFound("Space not found");

    const changedFields = [
      input.name !== undefined && input.name !== current.name ? "name" : null,
      input.description !== undefined && input.description !== current.description
        ? "description"
        : null,
    ].filter((field): field is string => field !== null);
    if (changedFields.length === 0) conflict("No effective space changes were supplied");

    const space = await tx.space.update({
      where: { id: spaceId },
      data: { name: input.name, description: input.description },
      select: SPACE_SELECT,
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "space_update",
        targetEntityType: "Space",
        targetEntityId: space.id,
        spaceId: space.id,
        details: { changedFields },
      },
    });
    return toSpaceResponse(space);
  });
}

export async function deleteAdminSpace(
  actor: SuperAdminActor,
  spaceId: string,
  confirmation: string,
  client: PrismaClient = prisma
): Promise<{ deletedSpaceId: string }> {
  return runSerializable(client, async (tx) => {
    await requireCurrentSuperAdmin(tx, actor);
    const space = await tx.space.findUnique({
      where: { id: spaceId },
      select: SPACE_SELECT,
    });
    if (!space) notFound("Space not found");

    if (confirmation !== `DELETE ${space.name}`) {
      conflict(`Confirmation must exactly match DELETE ${space.name}`);
    }

    const blockers = {
      members: space._count.memberships,
      posts: space._count.posts,
      invites: space._count.invites,
      reportedEntities: space._count.reportedEntities,
    };
    if (Object.values(blockers).some((count) => count > 0)) {
      conflict("Only an empty space can be deleted", blockers);
    }

    // Preserve historical logs while removing their FK to the soon-to-be
    // deleted space. No business data is cascaded by this operation.
    await tx.auditLog.updateMany({
      where: { spaceId },
      data: { spaceId: null },
    });
    await tx.space.delete({ where: { id: spaceId } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "space_delete",
        targetEntityType: "Space",
        targetEntityId: spaceId,
        spaceId: null,
      },
    });
    return { deletedSpaceId: spaceId };
  });
}

export async function listAdminAuditLogs(
  actor: SuperAdminActor,
  query: AuditLogQuery,
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    await requireCurrentSuperAdmin(tx, actor);
    const rows = await tx.auditLog.findMany({
      where: {
        spaceId: query.spaceId,
        action: query.action,
      },
      select: {
        id: true,
        actorUserId: true,
        action: true,
        targetEntityType: true,
        targetEntityId: true,
        spaceId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      skip: query.cursor ? 1 : 0,
      cursor: query.cursor ? { id: query.cursor } : undefined,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      logs: page.map((row) => ({
        ...row,
        actorUserId:
          row.targetEntityType === "Post" ||
          row.targetEntityType === "PostFlag" ||
          row.targetEntityType === "ReportedEntity"
            ? null
            : row.actorUserId,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
      hasMore,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
