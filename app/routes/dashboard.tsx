import { AppSidebar } from "~/components/app-sidebar";
import type { Route } from "./+types/home";
import { loginRedirect } from "~/lib/redirects";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "SafeSpace" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loginRedirect(request);
} 

export default function Home() {
  return <AppSidebar>Dashboard</AppSidebar>;
}
