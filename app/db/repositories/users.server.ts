import { prisma } from '~/db/client.server';
import type { User } from '~/generated/prisma';

export async function getTotalUsers() {
  return prisma.user.count();
}

type UserField = keyof User;

export async function getUserById<K extends UserField>(
  userId: string,
  select: Record<K, true>
): Promise<Pick<User, K> | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select,
  }) as Promise<Pick<User, K> | null>;
}
