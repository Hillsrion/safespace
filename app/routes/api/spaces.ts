import { data, type LoaderFunction } from "@remix-run/node";
import { getCurrentUser } from "~/services/auth.server";
import { getUserSpaces } from "~/db/repositories/spaces/queries.server";

export const loader: LoaderFunction = async ({ request }) => {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new Response("User not found", { status: 401 });
  }
  const spaces = await getUserSpaces(user.id);

  return data({ spaces });
};

// No default export needed for API routes
