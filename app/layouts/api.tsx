// routes/api/users/index.tsx
import { data, Outlet, type LoaderFunctionArgs } from "react-router";
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
