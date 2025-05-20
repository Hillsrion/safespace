import { redirect } from "@remix-run/node";
import { getSession, commitSession } from "~/services/session.server";
import { login } from "~/services/auth.server";

async function redirectToLogin(session: any): Promise<Response> {
  return redirect("/auth/login", {
    status: 400,
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export async function action({ request }: { request: Request }) {
  const session = await getSession(request);
  const user = session.get("user");
  if (user) {
    return redirect("/dashboard");
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
    return redirect("/dashboard", {
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
