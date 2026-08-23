import { type ActionFunction, type LoaderFunction, redirect } from "react-router";
import { destroySession, getSession } from "~/services/session.server";
import { requireSameOrigin } from "~/lib/security.server";

// Handle GET requests (direct navigation to /auth/logout)
export const loader: LoaderFunction = async ({ request }) => {
  return redirect("/auth/login");
};

// Handle POST requests (form submission for logout)
export const action: ActionFunction = async ({ request }) => {
  requireSameOrigin(request);
  const session = await getSession(request);
  return redirect("/auth/login", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
};
