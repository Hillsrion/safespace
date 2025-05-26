import { prisma } from "~/db/client.server";
import type { UserSpaceMembership, Space } from "~/generated/prisma";
import { getUserById } from "../users.server";

interface UserSpace extends Pick<Space, "id" | "name"> {
  role: UserSpaceMembership["role"];
}

export async function getUserSpaces(userId: string): Promise<UserSpace[]> {
  // First check if user is a superadmin
  const user = await getUserById(userId, { isSuperAdmin: true } as const);

  // If user is superadmin, return all spaces with admin role
  if (user?.isSuperAdmin) {
    const allSpaces = await prisma.space.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    return allSpaces.map((space) => ({
      id: space.id,
      name: space.name,
      role: "Admin", // Superadmins get admin role on all spaces
    }));
  }

  // For regular users, return only their memberships
  const memberships = await prisma.userSpaceMembership.findMany({
    where: { userId: userId },
    include: {
      space: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return memberships.map((membership) => ({
    id: membership.space.id,
    name: membership.space.name,
    role: membership.role,
  }));
}

export async function getTotalSpaces() {
  return prisma.space.count();
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
