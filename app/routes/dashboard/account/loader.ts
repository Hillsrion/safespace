import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getSession } from "~/services/session.server";
import { prisma } from "~/db/client.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request);
  const userId = session.get("user")?.id;

  if (!userId) {
    throw new Response("Non autorisé", { status: 401 });
  }

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
    },
  });

  if (!user) {
    throw new Response("Utilisateur non trouvé", { status: 404 });
  }

  return json(user);
}
