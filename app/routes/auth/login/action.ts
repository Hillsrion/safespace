import { redirect } from "react-router";
import { commitSession, getSession } from "~/services/session.server";
import {
  InvalidCredentialsError,
  login,
  isAuthenticated,
} from "~/services/auth.server";
import { DASHBOARD_PATH, LOGIN_PATH } from "~/lib/route-paths";
import { logServerException } from "~/lib/error/server-error.server";
import { requireSameOrigin } from "~/lib/security.server";

async function redirectToLogin(session: any): Promise<Response> {
  return redirect(LOGIN_PATH, {
    status: 400,
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export async function action({ request }: { request: Request }) {
  requireSameOrigin(request);
  const session = await getSession(request);
  if (await isAuthenticated(request)) {
    return redirect(DASHBOARD_PATH);
  }

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return redirectToLogin(session);
  }

  try {
    const user = await login(email, password);
    session.set("userId", user.id);
    return redirect(`/${DASHBOARD_PATH}`, {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  } catch (error) {
    if (!(error instanceof InvalidCredentialsError)) {
      logServerException(error, {
        operation: "auth.login",
        errorCode: "server_error:api",
        httpStatus: 500,
      });
    }
    // Keep invalid credentials and technical failures indistinguishable.
    session.flash("error", "Invalid credentials");
    return redirectToLogin(session);
  }
}
