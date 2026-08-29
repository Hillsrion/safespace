import { Prisma, type PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { getEffectiveSpaceAccess } from "~/services/effective-space-access.server";
import type {
  CreateReportedEntityInput,
  ReportedEntityListQuery,
  UpdateReportedEntityInput,
} from "~/lib/reported-entities";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

export type ReportedEntityAdminActor = { id: string };

export class ReportedEntityAdminError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ReportedEntityAdminError";
  }
}

const ENTITY_SELECT = {
  id: true,
  name: true,
  spaceId: true,
  createdAt: true,
  updatedAt: true,
  handles: {
    select: {
      id: true,
      platform: true,
      handle: true,
      createdAt: true,
      reviewStatus: true,
      reviewNote: true,
      reviewedAt: true,
    },
    orderBy: { handle: "asc" },
  },
  _count: { select: { posts: true } },
} as const;

type EntityRow = {
  id: string;
  name: string;
  spaceId: string;
  createdAt: Date;
  updatedAt: Date;
  handles: Array<{
    id: string;
    platform: string;
    handle: string;
    createdAt: Date;
    reviewStatus: string;
    reviewNote: string | null;
    reviewedAt: Date | null;
  }>;
  _count: { posts: number };
};

function forbidden(message: string): never {
  throw new ReportedEntityAdminError(403, message);
}

function badRequest(message: string): never {
  throw new ReportedEntityAdminError(400, message);
}

function notFound(message: string): never {
  throw new ReportedEntityAdminError(404, message);
}

function conflict(message: string, details?: unknown): never {
  throw new ReportedEntityAdminError(409, message, details);
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
  operation: (tx: TransactionClient) => Promise<T>,
  options: { mapForeignKeyConflict?: boolean } = {}
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await client.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        conflict("Duplicate handles are not allowed for an entity");
      }
      if (options.mapForeignKeyConflict && isPrismaCode(error, "P2003")) {
        conflict("An entity referenced by posts cannot be deleted");
      }
      if (!isPrismaCode(error, "P2034")) throw error;
      if (attempt === 3) {
        conflict("The entity changed concurrently; retry the request");
      }
    }
  }
  throw new Error("Unreachable transaction retry state");
}

async function requireCurrentAdministrator(
  tx: TransactionClient,
  actor: ReportedEntityAdminActor,
  spaceId: string
): Promise<void> {
  const access = await getEffectiveSpaceAccess(tx, actor.id, spaceId);
  if (!access.isSuperAdmin && access.role !== "ADMIN") {
    forbidden("Space administrator rights are required");
  }
}

async function requireAuthorizedSpace(
  tx: TransactionClient,
  actor: ReportedEntityAdminActor,
  spaceId: string
): Promise<void> {
  await requireCurrentAdministrator(tx, actor, spaceId);
  const space = await tx.space.findUnique({
    where: { id: spaceId },
    select: { id: true },
  });
  if (!space) notFound("Space not found");
}

function toEntityResponse(entity: EntityRow) {
  return {
    id: entity.id,
    name: entity.name,
    spaceId: entity.spaceId,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    handles: entity.handles.map((handle) => ({
      id: handle.id,
      platform: handle.platform,
      handle: handle.handle,
      createdAt: handle.createdAt.toISOString(),
      reviewStatus: handle.reviewStatus,
      reviewNote: handle.reviewNote,
      reviewedAt: handle.reviewedAt?.toISOString() ?? null,
    })),
    postCount: entity._count.posts,
  };
}

export async function reviewReportedEntityHandle(
  actor: ReportedEntityAdminActor,
  spaceId: string,
  entityId: string,
  handleId: string,
  input: { status: "unreviewed" | "consistent" | "questionable" | "obsolete"; note?: string },
  client: PrismaClient = prisma
) {
  return runSerializable(client, async (tx) => {
    await requireAuthorizedSpace(tx, actor, spaceId);
    const handle = await tx.reportedEntityHandle.findFirst({
      where: { id: handleId, reportedEntityId: entityId, reportedEntity: { spaceId } },
      select: { id: true },
    });
    if (!handle) notFound("Reported entity handle not found");
    const note = input.status === "unreviewed" ? null : input.note?.trim();
    if (input.status !== "unreviewed" && (!note || note.length < 3 || note.length > 500)) {
      badRequest("A review reason between 3 and 500 characters is required");
    }
    const updated = await tx.reportedEntityHandle.update({
      where: { id: handle.id },
      data: {
        reviewStatus: input.status,
        reviewNote: note,
        reviewedAt: input.status === "unreviewed" ? null : new Date(),
        reviewedByUserId: input.status === "unreviewed" ? null : actor.id,
      },
      select: { id: true, reviewStatus: true, reviewNote: true, reviewedAt: true },
    });
    await tx.auditLog.create({ data: {
      actorUserId: actor.id, action: "entity_update", targetEntityType: "ReportedEntityHandle",
      targetEntityId: handle.id, spaceId,
      details: { changedFields: ["internalHandleReview"], reviewStatus: input.status },
    } });
    return { ...updated, reviewedAt: updated.reviewedAt?.toISOString() ?? null };
  });
}

function handleKey(handle: { platform: string; handle: string }): string {
  return `${handle.platform}\u0000${handle.handle}`;
}

function handlesEqual(
  current: EntityRow["handles"],
  next: UpdateReportedEntityInput["handles"]
): boolean {
  if (!next || current.length !== next.length) return false;
  const currentKeys = current.map(handleKey).sort();
  const nextKeys = next.map(handleKey).sort();
  return currentKeys.every((key, index) => key === nextKeys[index]);
}

export async function listReportedEntitiesForAdmin(
  actor: ReportedEntityAdminActor,
  spaceId: string,
  query: ReportedEntityListQuery,
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    await requireAuthorizedSpace(tx, actor, spaceId);
    if (query.cursor) {
      const cursor = await tx.reportedEntity.findFirst({
        where: { id: query.cursor, spaceId },
        select: { id: true },
      });
      if (!cursor) notFound("Entity cursor not found");
    }

    const rows = await tx.reportedEntity.findMany({
      where: { spaceId },
      select: ENTITY_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      skip: query.cursor ? 1 : 0,
      cursor: query.cursor ? { id: query.cursor } : undefined,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      entities: page.map((entity) => toEntityResponse(entity as EntityRow)),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
      hasMore,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function getReportedEntityForAdmin(
  actor: ReportedEntityAdminActor,
  spaceId: string,
  entityId: string,
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    await requireAuthorizedSpace(tx, actor, spaceId);
    const entity = await tx.reportedEntity.findFirst({
      where: { id: entityId, spaceId },
      select: ENTITY_SELECT,
    });
    if (!entity) notFound("Reported entity not found");
    return toEntityResponse(entity as EntityRow);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function createReportedEntityForAdmin(
  actor: ReportedEntityAdminActor,
  spaceId: string,
  input: CreateReportedEntityInput,
  client: PrismaClient = prisma
) {
  return runSerializable(client, async (tx) => {
    await requireAuthorizedSpace(tx, actor, spaceId);
    const entity = await tx.reportedEntity.create({
      data: {
        name: input.name,
        spaceId,
        addedByUserId: actor.id,
        handles: { create: input.handles },
      },
      select: ENTITY_SELECT,
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "entity_add",
        targetEntityType: "ReportedEntity",
        targetEntityId: entity.id,
        spaceId,
      },
    });
    return toEntityResponse(entity as EntityRow);
  });
}

export async function updateReportedEntityForAdmin(
  actor: ReportedEntityAdminActor,
  spaceId: string,
  entityId: string,
  input: UpdateReportedEntityInput,
  client: PrismaClient = prisma
) {
  return runSerializable(client, async (tx) => {
    await requireAuthorizedSpace(tx, actor, spaceId);
    const current = await tx.reportedEntity.findFirst({
      where: { id: entityId, spaceId },
      select: ENTITY_SELECT,
    });
    if (!current) notFound("Reported entity not found");

    const currentRow = current as EntityRow;
    const changedFields = [
      input.name !== undefined && input.name !== currentRow.name ? "name" : null,
      input.handles !== undefined && !handlesEqual(currentRow.handles, input.handles)
        ? "handles"
        : null,
    ].filter((field): field is string => field !== null);
    if (changedFields.length === 0) conflict("No effective entity changes were supplied");

    const entity = await tx.reportedEntity.update({
      where: { id: entityId, spaceId },
      data: {
        ...(changedFields.includes("name") ? { name: input.name } : {}),
        ...(changedFields.includes("handles")
          ? {
              handles: {
                deleteMany: {},
                create: input.handles,
              },
            }
          : {}),
      },
      select: ENTITY_SELECT,
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "entity_update",
        targetEntityType: "ReportedEntity",
        targetEntityId: entity.id,
        spaceId,
        details: { changedFields },
      },
    });
    return toEntityResponse(entity as EntityRow);
  });
}

export async function deleteReportedEntityForAdmin(
  actor: ReportedEntityAdminActor,
  spaceId: string,
  entityId: string,
  client: PrismaClient = prisma
): Promise<{ deletedEntityId: string }> {
  return runSerializable(client, async (tx) => {
    await requireAuthorizedSpace(tx, actor, spaceId);
    const entity = await tx.reportedEntity.findFirst({
      where: { id: entityId, spaceId },
      select: { id: true, _count: { select: { posts: true } } },
    });
    if (!entity) notFound("Reported entity not found");
    if (entity._count.posts > 0) {
      conflict("An entity referenced by posts cannot be deleted", {
        posts: entity._count.posts,
      });
    }

    await tx.reportedEntity.delete({ where: { id: entityId, spaceId } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "entity_delete",
        targetEntityType: "ReportedEntity",
        targetEntityId: entityId,
        spaceId,
      },
    });
    return { deletedEntityId: entityId };
  }, { mapForeignKeyConflict: true });
}
