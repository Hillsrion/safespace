import { prisma } from '~/db/client.server';
import type { UserSpaceMembership, Space } from '~/generated/prisma';

interface UserSpace extends Pick<Space, 'id' | 'name'> {
  role: UserSpaceMembership['role'];
}

export async function getUserSpaces(userId: string): Promise<UserSpace[]> {
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

  return memberships.map(membership => ({
    id: membership.space.id,
    name: membership.space.name,
    role: membership.role,
  }));
}

export async function getTotalSpaces() {
  return prisma.space.count();
}
