// routes/api/users/index.tsx
import { data } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet } from "react-router-dom";
import { getCurrentUser } from "~/services/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw new Response("Forbidden", { status: 403 });
  }

  return data({
    ok: true,
  });
}

export default function ApiLayout() {
  return <Outlet />;
}