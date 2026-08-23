import {
  Form,
  data,
  redirect,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { requireSameOrigin } from "~/lib/security.server";
import { getCurrentUser, login } from "~/services/auth.server";
import {
  commitSession,
  getError,
  getSession,
} from "~/services/session.server";

const SUPERADMIN_LOGIN_PATH = "/auth/superadmin/login";
const INVALID_CREDENTIALS = "Identifiants administrateur invalides";

async function rejectLogin(session: Awaited<ReturnType<typeof getSession>>) {
  session.flash("error", INVALID_CREDENTIALS);
  return redirect(SUPERADMIN_LOGIN_PATH, {
    status: 303,
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  if (currentUser?.isSuperAdmin) throw redirect("/dashboard/superadmin");
  if (currentUser) throw redirect("/dashboard");
  const { error, setCookie } = await getError(request);
  return data({ error }, { headers: { "Set-Cookie": setCookie } });
}

export async function action({ request }: ActionFunctionArgs) {
  requireSameOrigin(request);
  if (request.method.toUpperCase() !== "POST") {
    return Response.json(
      { success: false, error: "Method not allowed" },
      { status: 405, headers: { Allow: "POST" } }
    );
  }

  const session = await getSession(request);
  const currentUser = await getCurrentUser(request);
  if (currentUser?.isSuperAdmin) throw redirect("/dashboard/superadmin");
  if (currentUser) throw redirect("/dashboard");

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return rejectLogin(session);

  try {
    const user = await login(email, password);
    if (!user.isSuperAdmin) return rejectLogin(session);
    session.set("userId", user.id);
    return redirect("/dashboard/superadmin", {
      status: 303,
      headers: { "Set-Cookie": await commitSession(session) },
    });
  } catch {
    return rejectLogin(session);
  }
}

export default function SuperAdminLoginPage() {
  const { error } = useLoaderData<typeof loader>();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accès SuperAdmin</CardTitle>
          <p className="text-sm text-muted-foreground">
            Portail réservé à l’administration globale de SafeSpace.
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <p
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          <Form className="space-y-4" method="post">
            <div className="space-y-2">
              <Label htmlFor="superadmin-email">Email</Label>
              <Input
                id="superadmin-email"
                autoComplete="username"
                inputMode="email"
                name="email"
                required
                type="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="superadmin-password">Mot de passe</Label>
              <Input
                id="superadmin-password"
                autoComplete="current-password"
                name="password"
                required
                type="password"
              />
            </div>
            <Button className="w-full" type="submit">
              Se connecter à l’administration
            </Button>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
