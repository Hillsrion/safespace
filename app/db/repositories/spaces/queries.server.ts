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

export async function getUserSpaceRole(userId: string, spaceId: string) {
  // Check if user is superadmin first
  const user = await getUserById(userId, { isSuperAdmin: true } as const);
  if (user?.isSuperAdmin) {
    return 'ADMIN' as const;
  }

  const membership = await prisma.userSpaceMembership.findFirst({
    where: {
      userId,
      spaceId,
    },
    select: {
      role: true,
    },
  });

  return membership?.role || null;
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
 * Removes a user from a space.
 * @param userId The ID of the user to remove.
 * @param spaceId The ID of the space to remove the user from.
 * @returns The result of the deleteMany operation (includes count of deleted records).
 * @throws Will throw an error if the database operation fails.
 */
export async function removeUserFromSpace(userId: string, spaceId: string) {
  try {
    const result = await prisma.userSpaceMembership.deleteMany({
      where: {
        userId: userId,
        spaceId: spaceId,
      },
    });

    // Optional: Check if any record was actually deleted
    if (result.count === 0) {
      // This could mean the user was not a member, or IDs were incorrect.
      // For now, let's log it and still consider it a successful operation.
      console.warn(
        `No membership found for user ${userId} in space ${spaceId} to remove.`
      );
    }

    return result; // Contains count of deleted records
  } catch (error) {
    console.error(
      `Error removing user ${userId} from space ${spaceId}:`,
      error
    );
    throw new Error(`Failed to remove user from space.`);
  }
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
