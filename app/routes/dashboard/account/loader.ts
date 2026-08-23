import { data, type LoaderFunctionArgs } from "react-router";
import { requireUserId } from "~/services/auth.server";
import { prisma } from "~/db/client.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const user = await prisma.user.findUnique({
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
          space: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) {
    throw new Response("Utilisateur non trouvé", { status: 404 });
  }

  return data(user);
}
