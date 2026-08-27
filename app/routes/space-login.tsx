import { data, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

import { resolveSpaceLoginDestination } from "~/lib/space-login.server";
import { requireSameOrigin } from "~/lib/security.server";
import { getCurrentUser, login } from "~/services/auth.server";
import { commitSession, getError, getSession } from "~/services/session.server";

const INVALID_CREDENTIALS = "Invalid credentials";

function currentPath(request: Request): string {
  const url = new URL(request.url);
  // Do not retain arbitrary query parameters in an authentication redirect.
  return url.pathname;
}

async function rejectLogin(request: Request) {
  const session = await getSession(request);
  session.flash("error", INVALID_CREDENTIALS);
  return redirect(currentPath(request), {
    status: 303,
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  if (user) {
    throw redirect(await resolveSpaceLoginDestination(user, params.spaceId));
  }

  // Deliberately no lookup of params.spaceId here: this page has identical
  // content and status for a valid private space, an unknown UUID and text.
  const { error, setCookie } = await getError(request);
  return data({ error }, { headers: { "Set-Cookie": setCookie } });
}

export async function action({ request, params }: ActionFunctionArgs) {
  requireSameOrigin(request);
  if (request.method.toUpperCase() !== "POST") {
    return Response.json(
      { success: false, error: "Method not allowed" },
      { status: 405, headers: { Allow: "POST" } }
    );
  }

  const currentUser = await getCurrentUser(request);
  if (currentUser) {
    return redirect(
      await resolveSpaceLoginDestination(currentUser, params.spaceId)
    );
  }

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return rejectLogin(request);

  try {
    const user = await login(email, password);
    const session = await getSession(request);
    session.set("userId", user.id);
    return redirect(await resolveSpaceLoginDestination(user, params.spaceId), {
      status: 303,
      headers: { "Set-Cookie": await commitSession(session) },
    });
  } catch {
    return rejectLogin(request);
  }
}

// The standard form is intentionally reused: a space URL must reveal neither
// its name nor an invitation state before credentials have been verified.
export { default } from "~/routes/auth/login/index";
