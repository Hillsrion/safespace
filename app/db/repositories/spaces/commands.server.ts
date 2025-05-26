import { prisma } from '~/db/client.server';
import type { Space, UserSpaceMembership } from '~/generated/prisma';

/**
 * Creates a new space in the database.
 * @param name The name of the space.
 * @param description An optional description for the space.
 * @param userId The ID of the user creating the space.
 * @returns The created Space object.
 */
export async function createSpace(name: string, description: string | null, userId: string): Promise<Space> {
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
export async function addUserToSpace(userId: string, spaceId: string, role: string): Promise<UserSpaceMembership> {
  return prisma.userSpaceMembership.create({
    data: {
      userId,
      spaceId,
      role,
    },
  });
}
