import { prisma } from '~/db/client.server';

export async function getTotalUsers() {
  return prisma.user.count();
}
