import { prisma } from "~/db/client.server";
import type { UserSpaceMembership, Space } from "~/generated/prisma";
import { getEffectiveSpaceAccess } from "~/services/effective-space-access.server";

interface UserSpace extends Pick<Space, "id" | "name"> {
  role: UserSpaceMembership["role"];
}

export async function getUserSpaces(userId: string): Promise<UserSpace[]> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });
    if (!user) return [];
    if (user.isSuperAdmin) {
      const allSpaces = await tx.space.findMany({
        select: { id: true, name: true },
      });
      return allSpaces.map((space) => ({ ...space, role: "Admin" }));
    }

    const memberships = await tx.userSpaceMembership.findMany({
      where: { userId },
      select: { spaceId: true },
    });
    const access = await Promise.all(
      memberships.map(async ({ spaceId }) => ({
        spaceId,
        access: await getEffectiveSpaceAccess(tx, userId, spaceId),
      }))
    );
    const effectiveRoles = new Map(
      access
        .filter(({ access: item }) => item.role !== null)
        .map(({ spaceId, access: item }) => [spaceId, item.role!])
    );
    if (effectiveRoles.size === 0) return [];
    const spaces = await tx.space.findMany({
      where: { id: { in: [...effectiveRoles.keys()] } },
      select: { id: true, name: true },
    });
    return spaces.map((space) => ({
      ...space,
      role: effectiveRoles.get(space.id)!,
    }));
  });
}

export async function getTotalSpaces() {
  return prisma.space.count();
}

export async function getUserSpaceRole(userId: string, spaceId: string) {
  return prisma.$transaction(async (tx) => {
    const access = await getEffectiveSpaceAccess(tx, userId, spaceId);
    return access.isSuperAdmin ? "ADMIN" as const : access.role;
  });
}

/**
 * Creates a new space in the database.
 * @param name The name of the space.
 * @param description An optional description for the space.
 * @param userId The ID of the user creating the space.
 * @returns The created Space object.
 */
export async function createSpace(
  name: string,
  description: string | null,
  userId: string
): Promise<Space> {
  return prisma.space.create({
    data: {
      name,
      description: description, // Prisma handles null appropriately
      createdBy: userId,
    },
  });
}

/** Create a space and its initial admin membership as one atomic operation. */
export async function createSpaceWithAdmin(
  name: string,
  description: string | null,
  userId: string
): Promise<Space> {
  return prisma.$transaction(async (transaction) => {
    const space = await transaction.space.create({
      data: { name, description, createdBy: userId },
    });

    await transaction.userSpaceMembership.create({
      data: { userId, spaceId: space.id, role: "ADMIN" },
    });

    return space;
  });
}

/**
 * Adds a user to a space with a specific role.
 * @param userId The ID of the user to add.
 * @param spaceId The ID of the space to add the user to.
 * @param role The role to assign to the user in the space.
 * @returns The created UserSpaceMembership object.
 */
export async function addUserToSpace(
  userId: string,
  spaceId: string,
  role: string
): Promise<UserSpaceMembership> {
  return prisma.userSpaceMembership.create({
    data: {
      userId,
      spaceId,
      role,
    },
  });
}
