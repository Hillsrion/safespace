import { Prisma, type PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { errors } from "~/lib/api/http-error";
import { normalizeSpaceRole } from "~/lib/invitations";
import type {
  CreateReportInput,
  ReportedEntityTargetInput,
  ReportWriteResponse,
  UpdateReportInput,
} from "~/lib/reports";

type Actor = { id: string; isSuperAdmin: boolean };
type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

const POST_RESPONSE_SELECT = {
  id: true,
  spaceId: true,
  description: true,
  isAnonymous: true,
  isAdminOnly: true,
  createdAt: true,
  updatedAt: true,
  reportedEntity: {
    select: {
      id: true,
      name: true,
      handles: { select: { handle: true }, orderBy: { handle: "asc" as const } },
    },
  },
} as const;

type SelectedPost = {
  id: string;
  spaceId: string;
  description: string;
  isAnonymous: boolean;
  isAdminOnly: boolean;
  createdAt: Date;
  updatedAt: Date;
  reportedEntity: {
    id: string;
    name: string;
    handles: Array<{ handle: string }>;
  };
};

type EntityResolution = {
  id: string;
  auditAction?: "entity_add" | "entity_update";
  addedHandles?: string[];
};

const MAX_TRANSACTION_ATTEMPTS = 3;

async function getWriteRole(
  tx: TransactionClient,
  actor: Actor,
  spaceId: string
): Promise<string> {
  if (actor.isSuperAdmin) return "SUPER_ADMIN";

  // Membership presence is the current schema's definition of active
  // membership. This lookup intentionally happens inside the write transaction.
  const membership = await tx.userSpaceMembership.findUnique({
    where: { userId_spaceId: { userId: actor.id, spaceId } },
    select: { role: true },
  });

  return membership ? normalizeSpaceRole(membership.role) ?? "" : "";
}

function canCreate(role: string): boolean {
  return ["EDITOR", "MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(role);
}

function canEdit(role: string, isAuthor: boolean): boolean {
  if (["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(role)) return true;
  return role === "EDITOR" && isAuthor;
}

async function resolveEntity(
  tx: TransactionClient,
  spaceId: string,
  actorId: string,
  target: ReportedEntityTargetInput
): Promise<EntityResolution> {
  const matches = await tx.reportedEntity.findMany({
    where: {
      spaceId,
      OR: [
        { name: { equals: target.name, mode: "insensitive" } },
        {
          handles: {
            some: {
              handle: { in: target.handles, mode: "insensitive" },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      handles: { select: { handle: true } },
    },
  });

  if (matches.length > 1) {
    throw errors.conflict(
      "The supplied name or handles match multiple entities in this space"
    );
  }

  const existing = matches[0];
  if (existing) {
    if (existing.name.trim().toLowerCase() !== target.name.toLowerCase()) {
      throw errors.conflict(
        "An Instagram handle is already assigned to another entity in this space"
      );
    }

    const currentHandles = new Set(
      existing.handles.map(({ handle }) => handle.toLowerCase())
    );
    const missingHandles = target.handles.filter(
      (handle) => !currentHandles.has(handle)
    );

    if (missingHandles.length > 0) {
      await tx.reportedEntityHandle.createMany({
        data: missingHandles.map((handle) => ({
          reportedEntityId: existing.id,
          platform: "Instagram",
          handle,
        })),
        skipDuplicates: true,
      });
    }

    return {
      id: existing.id,
      auditAction: missingHandles.length > 0 ? "entity_update" : undefined,
      addedHandles: missingHandles.length > 0 ? missingHandles : undefined,
    };
  }

  const created = await tx.reportedEntity.create({
    data: {
      name: target.name,
      spaceId,
      addedByUserId: actorId,
      handles: {
        create: target.handles.map((handle) => ({
          platform: "Instagram",
          handle,
        })),
      },
    },
    select: { id: true },
  });

  return { id: created.id, auditAction: "entity_add" };
}

async function auditEntityResolution(
  tx: TransactionClient,
  actorId: string,
  spaceId: string,
  resolution: EntityResolution
): Promise<void> {
  if (!resolution.auditAction) return;

  await tx.auditLog.create({
    data: {
      actorUserId: actorId,
      action: resolution.auditAction,
      targetEntityType: "ReportedEntity",
      targetEntityId: resolution.id,
      spaceId,
      details:
        resolution.auditAction === "entity_update"
          ? { addedHandles: resolution.addedHandles }
          : undefined,
    },
  });
}

function isRetryableTransactionConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

async function runSerializable<T>(
  client: PrismaClient,
  operation: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await client.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isRetryableTransactionConflict(error)) throw error;
      if (attempt === MAX_TRANSACTION_ATTEMPTS) {
        throw errors.conflict(
          "The report changed concurrently; retry the request"
        );
      }
    }
  }

  throw new Error("Unreachable transaction retry state");
}

function toResponse(post: SelectedPost): ReportWriteResponse {
  return {
    success: true,
    post: {
      id: post.id,
      spaceId: post.spaceId,
      description: post.description,
      isAnonymous: post.isAnonymous,
      isAdminOnly: post.isAdminOnly,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      reportedEntity: {
        id: post.reportedEntity.id,
        name: post.reportedEntity.name,
        handles: post.reportedEntity.handles.map(({ handle }) => handle),
      },
    },
  };
}

export async function createReport(
  actor: Actor,
  input: CreateReportInput,
  client: PrismaClient = prisma
): Promise<ReportWriteResponse> {
  return runSerializable(client, async (tx) => {
    const role = await getWriteRole(tx, actor, input.spaceId);
    if (!canCreate(role)) {
      throw errors.forbidden("An active Editor membership or higher is required");
    }

    const entityResolution = await resolveEntity(
      tx,
      input.spaceId,
      actor.id,
      input.entity
    );
    await auditEntityResolution(
      tx,
      actor.id,
      input.spaceId,
      entityResolution
    );
    const post = await tx.post.create({
      data: {
        spaceId: input.spaceId,
        authorId: actor.id,
        reportedEntityId: entityResolution.id,
        description: input.description,
        isAnonymous: input.isAnonymous,
        isAdminOnly: input.isAdminOnly,
      },
      select: POST_RESPONSE_SELECT,
    });

    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "post_create",
        targetEntityType: "Post",
        targetEntityId: post.id,
        spaceId: input.spaceId,
        details: {
          reportedEntityId: entityResolution.id,
          isAnonymous: input.isAnonymous,
          isAdminOnly: input.isAdminOnly,
        },
      },
    });

    return toResponse(post);
  });
}

export async function updateReport(
  postId: string,
  actor: Actor,
  input: UpdateReportInput,
  client: PrismaClient = prisma
): Promise<ReportWriteResponse> {
  return runSerializable(client, async (tx) => {
    const current = await tx.post.findUnique({
      where: { id: postId },
      select: { id: true, spaceId: true, authorId: true },
    });
    if (!current) throw errors.notFound("Post not found");

    const role = await getWriteRole(tx, actor, current.spaceId);
    if (!canEdit(role, current.authorId === actor.id)) {
      throw errors.forbidden("You do not have permission to edit this report");
    }

    if (input.spaceId && input.spaceId !== current.spaceId) {
      throw errors.badRequest("A report cannot be moved to another space");
    }

    const entityResolution = input.entity
      ? await resolveEntity(tx, current.spaceId, actor.id, input.entity)
      : undefined;
    if (entityResolution) {
      await auditEntityResolution(
        tx,
        actor.id,
        current.spaceId,
        entityResolution
      );
    }
    const changedFields = [
      input.entity !== undefined ? "entity" : null,
      input.description !== undefined ? "description" : null,
      input.isAnonymous !== undefined ? "isAnonymous" : null,
      input.isAdminOnly !== undefined ? "isAdminOnly" : null,
    ].filter((field): field is string => field !== null);

    const post = await tx.post.update({
      where: { id: postId },
      data: {
        reportedEntityId: entityResolution?.id,
        description: input.description,
        isAnonymous: input.isAnonymous,
        isAdminOnly: input.isAdminOnly,
      },
      select: POST_RESPONSE_SELECT,
    });

    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "post_update",
        targetEntityType: "Post",
        targetEntityId: post.id,
        spaceId: current.spaceId,
        details: { changedFields },
      },
    });

    return toResponse(post);
  });
}
