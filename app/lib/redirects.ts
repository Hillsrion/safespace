import { redirect } from "react-router";
import { getCurrentUser } from "~/services/auth.server";

export async function baseAuthRedirect(request: Request) {
  const user = await getCurrentUser(request);
  if (user) {
    return redirect("/dashboard");
  } else {
    return redirect("/auth/login");
  }
}
