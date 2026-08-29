import type { Prisma, PrismaClient } from "~/generated/prisma";

import { prisma } from "~/db/client.server";
import type { SpaceMemberListQuery } from "~/lib/space-member-list";
import { normalizeSpaceRole, type SpaceRole } from "~/lib/invitations";
import { getEffectiveSpaceAccess } from "~/services/effective-space-access.server";

type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export class SpaceMemberListError extends Error {
  constructor(
    public readonly status: 403 | 404,
    message: string
  ) {
    super(message);
    this.name = "SpaceMemberListError";
  }
}

const MEMBER_SELECT = {
  role: true,
  joinedAt: true,
  activity: { select: { lastActiveDay: true } },
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
} satisfies Prisma.UserSpaceMembershipSelect;

type ListedMembership = Prisma.UserSpaceMembershipGetPayload<{
  select: typeof MEMBER_SELECT;
}>;

const ROLE_DATABASE_VALUES: Record<SpaceRole, string[]> = {
  READ_ONLY: ["READ_ONLY", "Read-only", "read-only", "read_only"],
  EDITOR: ["EDITOR", "Editor", "editor"],
  MODERATOR: ["MODERATOR", "Moderator", "moderator"],
  ADMIN: ["ADMIN", "Admin", "admin"],
};

function forbidden(): never {
  throw new SpaceMemberListError(403, "Space administrator rights are required");
}

function notFound(): never {
  throw new SpaceMemberListError(404, "Space not found");
}

async function requireCurrentAdministrator(
  tx: TransactionClient,
  actorId: string,
  spaceId: string
): Promise<void> {
  const space = await tx.space.findUnique({
    where: { id: spaceId },
    select: { id: true },
  });
  if (!space) notFound();

  const access = await getEffectiveSpaceAccess(tx, actorId, spaceId);
  if (!access.isSuperAdmin && access.role !== "ADMIN") forbidden();
}

function toMemberResponse(membership: ListedMembership) {
  const role = normalizeSpaceRole(membership.role);
  if (!role) throw new Error("Invalid space membership role");

  return {
    id: membership.user.id,
    email: membership.user.email,
    firstName: membership.user.firstName,
    lastName: membership.user.lastName,
    role,
    joinedAt: membership.joinedAt.toISOString(),
    lastActiveDay: membership.activity?.lastActiveDay.toISOString() ?? null,
  };
}

export async function listSpaceMembers(
  actor: { id: string },
  spaceId: string,
  query: SpaceMemberListQuery,
  client: PrismaClient = prisma
) {
  return client.$transaction(
    async (tx) => {
      await requireCurrentAdministrator(tx, actor.id, spaceId);

      const where: Prisma.UserSpaceMembershipWhereInput = {
        spaceId,
        ...(query.role ? { role: { in: ROLE_DATABASE_VALUES[query.role] } } : {}),
        ...(query.q
          ? {
              user: {
                OR: [
                  { email: { contains: query.q, mode: "insensitive" as const } },
                  { firstName: { contains: query.q, mode: "insensitive" as const } },
                  { lastName: { contains: query.q, mode: "insensitive" as const } },
                ],
              },
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        tx.userSpaceMembership.findMany({
          where,
          select: MEMBER_SELECT,
          orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        tx.userSpaceMembership.count({ where }),
      ]);

      return {
        users: rows.map(toMemberResponse),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        },
      };
    },
    { isolationLevel: "RepeatableRead" }
  );
}
