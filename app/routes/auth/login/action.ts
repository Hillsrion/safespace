import { redirect } from "@remix-run/node";
import { commitSession, getSession } from "~/services/session.server";
import { login, isAuthenticated } from "~/services/auth.server";
import { DASHBOARD_PATH, LOGIN_PATH } from "~/routes";

async function redirectToLogin(session: any): Promise<Response> {
  return redirect(LOGIN_PATH, {
    status: 400,
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export async function action({ request }: { request: Request }) {
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
    session.set("user", user);
    return redirect(`/${DASHBOARD_PATH}`, {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      session.flash("error", error.message);
    }
    return redirectToLogin(session);
  }
}
