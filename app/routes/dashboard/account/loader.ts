import { data, type LoaderFunctionArgs } from "react-router";
import { requireUserId } from "~/services/auth.server";
import { prisma } from "~/db/client.server";
import { listOwnModerationDecisions } from "~/services/moderation-governance.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const [user, moderationDecisions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        instagram: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          orderBy: { joinedAt: "asc" },
          select: {
            role: true,
            spaceId: true,
          },
        },
      },
    }),
    listOwnModerationDecisions({ id: userId }),
  ]);

  if (!user) {
    throw new Response("Utilisateur non trouvé", { status: 404 });
  }

  // Own memberships remain visible after suspension, but their Space row
  // does not. A required Prisma relation would throw instead of letting this
  // member reach their data controls and leave the inaccessible space.
  const spaces = await prisma.space.findMany({
    where: { id: { in: user.memberships.map(({ spaceId }) => spaceId) } },
    select: { id: true, name: true },
  });
  const spacesById = new Map(spaces.map((space) => [space.id, space]));
  return data({
    ...user,
    memberships: user.memberships.map(({ spaceId, role }) => ({
      role,
      space: spacesById.get(spaceId) ?? { id: spaceId, name: "Espace à accès suspendu" },
    })),
    moderationDecisions,
  });
}
