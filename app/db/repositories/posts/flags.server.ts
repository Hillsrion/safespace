import { Prisma, type PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import { errors } from "~/lib/api/http-error";
import { normalizeSpaceRole, type SpaceRole } from "~/lib/invitations";
import type {
  CreatePostFlagInput,
  ModerationDecisionInput,
  ModerationFlag,
  ModerationFlagsQuery,
  ModerationQueueResponse,
  PostFlagResponse,
} from "~/lib/post-flags";

type Actor = { id: string };
type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];
type AuthorizationClient = Pick<
  TransactionClient,
  "user" | "userSpaceMembership"
>;
type CurrentAccess = {
  isSuperAdmin: boolean;
  role: SpaceRole | null;
};

const ELEVATED_ROLE_VALUES = [
  "ADMIN",
  "MODERATOR",
  "Admin",
  "Moderator",
  "admin",
  "moderator",
] as const;
const MAX_TRANSACTION_ATTEMPTS = 3;

const FLAG_RESPONSE_SELECT = {
  id: true,
  postId: true,
  reason: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
} as const;

const MODERATION_FLAG_SELECT = {
  ...FLAG_RESPONSE_SELECT,
  post: {
    select: {
      id: true,
      description: true,
      isAnonymous: true,
      isAdminOnly: true,
      status: true,
      createdAt: true,
      reportedEntity: {
        select: {
          id: true,
          name: true,
          handles: {
            select: { handle: true, platform: true },
            orderBy: { handle: "asc" as const },
          },
        },
      },
    },
  },
} as const;

type SelectedFlag = {
  id: string;
  postId: string;
  reason: string | null;
  status: "pending_review" | "resolved" | "rejected";
  createdAt: Date;
  resolvedAt: Date | null;
};

type SelectedModerationFlag = SelectedFlag & {
  post: {
    id: string;
    description: string;
    isAnonymous: boolean;
    isAdminOnly: boolean;
    status: "active" | "hidden";
    createdAt: Date;
    reportedEntity: {
      id: string;
      name: string;
      handles: Array<{ handle: string; platform: string }>;
    };
  };
};

function isElevated(role: SpaceRole | null): boolean {
  return role === "MODERATOR" || role === "ADMIN";
}

function hasPrismaCode(error: unknown, code: string): boolean {
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
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await client.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      // The partial unique index is the final concurrency guard for duplicate
      // pending flags. Translate its race outcome into the public contract.
      if (hasPrismaCode(error, "P2002")) {
        throw errors.conflict("You already have a pending flag for this post");
      }
      if (!hasPrismaCode(error, "P2034")) throw error;
      if (attempt === MAX_TRANSACTION_ATTEMPTS) {
        throw errors.conflict("The moderation state changed; retry the request");
      }
    }
  }

  throw new Error("Unreachable transaction retry state");
}

async function getCurrentAccess(
  client: AuthorizationClient,
  actor: Actor,
  spaceId: string
): Promise<CurrentAccess> {
  // The session proves identity only. Global and space-specific privileges are
  // always re-read from the database at the point of use.
  const currentActor = await client.user.findUnique({
    where: { id: actor.id },
    select: { isSuperAdmin: true },
  });
  if (!currentActor) throw errors.unauthorized("Authentication is no longer valid");
  if (currentActor.isSuperAdmin) {
    return { isSuperAdmin: true, role: null };
  }

  const membership = await client.userSpaceMembership.findUnique({
    where: { userId_spaceId: { userId: actor.id, spaceId } },
    select: { role: true },
  });
  return {
    isSuperAdmin: false,
    role: membership ? normalizeSpaceRole(membership.role) : null,
  };
}

function toFlagResponse(flag: SelectedFlag): PostFlagResponse {
  return {
    id: flag.id,
    postId: flag.postId,
    reason: flag.reason,
    status: flag.status,
    createdAt: flag.createdAt.toISOString(),
    resolvedAt: flag.resolvedAt?.toISOString() ?? null,
  };
}

function toModerationFlag(flag: SelectedModerationFlag): ModerationFlag {
  return {
    ...toFlagResponse(flag),
    post: {
      id: flag.post.id,
      description: flag.post.description,
      isAnonymous: flag.post.isAnonymous,
      isAdminOnly: flag.post.isAdminOnly,
      status: flag.post.status,
      createdAt: flag.post.createdAt.toISOString(),
      reportedEntity: flag.post.reportedEntity,
    },
  };
}

export async function createPostFlag(
  actor: Actor,
  input: CreatePostFlagInput,
  client: PrismaClient = prisma
): Promise<PostFlagResponse> {
  return runSerializable(client, async (tx) => {
    const access = await getCurrentAccess(tx, actor, input.spaceId);
    if (!access.isSuperAdmin && access.role === null) {
      throw errors.notFound("Post not found");
    }

    const post = await tx.post.findFirst({
      where: { id: input.postId, spaceId: input.spaceId },
      select: { id: true, status: true, isAdminOnly: true },
    });
    if (!post || post.status !== "active") {
      throw errors.notFound("Post not found");
    }
    if (
      post.isAdminOnly &&
      !access.isSuperAdmin &&
      !isElevated(access.role)
    ) {
      throw errors.notFound("Post not found");
    }

    const existing = await tx.postFlag.findFirst({
      where: {
        postId: post.id,
        flaggerUserId: actor.id,
        status: "pending_review",
      },
      select: { id: true },
    });
    if (existing) {
      throw errors.conflict("You already have a pending flag for this post");
    }

    const flag = await tx.postFlag.create({
      data: {
        postId: post.id,
        flaggerUserId: actor.id,
        reason: input.reason,
      },
      select: FLAG_RESPONSE_SELECT,
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "post_flag",
        targetEntityType: "PostFlag",
        targetEntityId: flag.id,
        spaceId: input.spaceId,
        details: { postId: post.id },
      },
    });

    return toFlagResponse(flag);
  });
}

export async function listModerationFlags(
  actor: Actor,
  input: ModerationFlagsQuery,
  client: PrismaClient = prisma
): Promise<ModerationQueueResponse> {
  return runSerializable(client, async (tx) => {
    const access = await getCurrentAccess(tx, actor, input.spaceId);
    if (!access.isSuperAdmin && access.role === null) {
      throw errors.notFound("Moderation queue not found");
    }
    if (!access.isSuperAdmin && !isElevated(access.role)) {
      throw errors.forbidden("Moderator rights are required");
    }

    const flags = await tx.postFlag.findMany({
      where: {
        status: input.status,
        post: {
          spaceId: input.spaceId,
          ...(access.isSuperAdmin
            ? {}
            : {
                space: {
                  memberships: {
                    some: {
                      userId: actor.id,
                      role: { in: [...ELEVATED_ROLE_VALUES] },
                    },
                  },
                },
              }),
        },
      },
      select: MODERATION_FLAG_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      skip: input.cursor ? 1 : 0,
      cursor: input.cursor ? { id: input.cursor } : undefined,
    });

    const hasNextPage = flags.length > input.limit;
    const page = hasNextPage ? flags.slice(0, input.limit) : flags;
    return {
      flags: page.map(toModerationFlag),
      nextCursor: hasNextPage ? page.at(-1)?.id : undefined,
      hasNextPage,
    };
  });
}

export async function decideModerationFlag(
  actor: Actor,
  input: ModerationDecisionInput,
  client: PrismaClient = prisma
): Promise<PostFlagResponse> {
  return runSerializable(client, async (tx) => {
    const access = await getCurrentAccess(tx, actor, input.spaceId);
    if (!access.isSuperAdmin && access.role === null) {
      throw errors.notFound("Moderation flag not found");
    }
    if (!access.isSuperAdmin && !isElevated(access.role)) {
      throw errors.forbidden("Moderator rights are required");
    }

    const current = await tx.postFlag.findFirst({
      where: { id: input.flagId, post: { spaceId: input.spaceId } },
      select: FLAG_RESPONSE_SELECT,
    });
    if (!current) throw errors.notFound("Moderation flag not found");
    if (current.status !== "pending_review") {
      throw errors.conflict("This moderation flag has already been decided");
    }

    const resolvedAt = new Date();
    const flag = await tx.postFlag.update({
      where: { id: current.id },
      data: {
        status: input.status,
        resolvedByUserId: actor.id,
        resolvedAt,
      },
      select: FLAG_RESPONSE_SELECT,
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "flag_resolve",
        targetEntityType: "PostFlag",
        targetEntityId: current.id,
        spaceId: input.spaceId,
        details: {
          postId: current.postId,
          previousStatus: current.status,
          status: input.status,
        },
      },
    });

    return toFlagResponse(flag);
  });
}
