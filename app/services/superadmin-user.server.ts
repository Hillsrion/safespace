import type { Prisma, PrismaClient } from "~/generated/prisma";
import { prisma } from "~/db/client.server";
import type { AdminUserListQuery } from "~/lib/superadmin-users";

type TransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

export type SuperAdminUserActor = { id: string };

export class SuperAdminUserError extends Error {
  constructor(
    public readonly status: 403 | 404,
    message: string
  ) {
    super(message);
    this.name = "SuperAdminUserError";
  }
}

const LIST_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isSuperAdmin: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { memberships: true } },
} satisfies Prisma.UserSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  codeOfConductAcceptedAt: true,
  memberships: {
    orderBy: [{ joinedAt: "asc" }, { spaceId: "asc" }],
    select: {
      role: true,
      joinedAt: true,
      space: { select: { id: true, name: true } },
    },
  },
  _count: {
    select: {
      memberships: true,
      authoredPosts: true,
      uploadedMedia: true,
      postedFlags: true,
    },
  },
} satisfies Prisma.UserSelect;

type ListedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { memberships: number };
};

type DetailedUser = Omit<ListedUser, "_count"> & {
  codeOfConductAcceptedAt: Date | null;
  memberships: Array<{
    role: string;
    joinedAt: Date;
    space: { id: string; name: string };
  }>;
  _count: {
    memberships: number;
    authoredPosts: number;
    uploadedMedia: number;
    postedFlags: number;
  };
};

function forbidden(): never {
  throw new SuperAdminUserError(
    403,
    "Current super-administrator rights are required"
  );
}

function notFound(): never {
  throw new SuperAdminUserError(404, "User not found");
}

async function requireCurrentSuperAdmin(
  tx: TransactionClient,
  actor: SuperAdminUserActor
): Promise<void> {
  // Session state is not trusted for authorization. Keep this read in the same
  // transaction as the global user query so revocation takes effect immediately.
  const currentActor = await tx.user.findUnique({
    where: { id: actor.id },
    select: { isSuperAdmin: true },
  });
  if (!currentActor?.isSuperAdmin) forbidden();
}

function toListResponse(user: ListedUser) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isSuperAdmin: user.isSuperAdmin,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    membershipCount: user._count.memberships,
  };
}

function toDetailResponse(user: DetailedUser) {
  return {
    ...toListResponse({
      ...user,
      _count: { memberships: user._count.memberships },
    }),
    codeOfConductAccepted: user.codeOfConductAcceptedAt !== null,
    memberships: user.memberships.map((membership) => ({
      spaceId: membership.space.id,
      spaceName: membership.space.name,
      role: membership.role,
      joinedAt: membership.joinedAt.toISOString(),
    })),
    counts: {
      authoredPosts: user._count.authoredPosts,
      uploadedMedia: user._count.uploadedMedia,
      postedFlags: user._count.postedFlags,
    },
  };
}

const ROLE_DATABASE_VALUES = {
  READ_ONLY: ["READ_ONLY", "Read-only", "read-only", "read_only"],
  EDITOR: ["EDITOR", "Editor", "editor"],
  MODERATOR: ["MODERATOR", "Moderator", "moderator"],
  ADMIN: ["ADMIN", "Admin", "admin"],
} as const;

function membershipFilter(query: AdminUserListQuery) {
  if (!query.spaceId && !query.role) return undefined;
  return {
    some: {
      spaceId: query.spaceId,
      role: query.role ? { in: [...ROLE_DATABASE_VALUES[query.role]] } : undefined,
    },
  };
}

export async function listAdminUsers(
  actor: SuperAdminUserActor,
  query: AdminUserListQuery,
  client: PrismaClient = prisma
) {
  return client.$transaction(
    async (tx) => {
      await requireCurrentSuperAdmin(tx, actor);
      const rows = await tx.user.findMany({
        where: {
          isSuperAdmin: query.isSuperAdmin,
          memberships: membershipFilter(query),
          ...(query.q
            ? {
                OR: [
                  { email: { contains: query.q, mode: "insensitive" as const } },
                  {
                    firstName: {
                      contains: query.q,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    lastName: {
                      contains: query.q,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              }
            : {}),
        },
        select: LIST_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        skip: query.cursor ? 1 : 0,
        cursor: query.cursor ? { id: query.cursor } : undefined,
      });

      const hasMore = rows.length > query.limit;
      const page = hasMore ? rows.slice(0, query.limit) : rows;
      return {
        users: page.map(toListResponse),
        nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
        hasMore,
      };
    },
    { isolationLevel: "RepeatableRead" }
  );
}

export async function getAdminUser(
  actor: SuperAdminUserActor,
  userId: string,
  client: PrismaClient = prisma
) {
  return client.$transaction(
    async (tx) => {
      await requireCurrentSuperAdmin(tx, actor);
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: DETAIL_SELECT,
      });
      if (!user) notFound();
      return toDetailResponse(user);
    },
    { isolationLevel: "RepeatableRead" }
  );
}
