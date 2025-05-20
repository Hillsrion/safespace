import type { Route } from "./+types/dashboard";
import { loginRedirect } from "~/lib/redirects";

export function meta({}: Route.MetaArgs) {
  return [{ title: "SafeSpace" }];
}

export async function loader({ request }: { request: Request }) {
  return loginRedirect(request);
}

export default function Dashboard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
      {/* Your dashboard content goes here */}
    </div>
  );
}
