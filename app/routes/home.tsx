import type { Route } from "./+types/home";
import { baseAuthRedirect } from "~/lib/redirects";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "SafeSpace" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  return baseAuthRedirect(request);
} 

export default function Home() {
  return <div></div>;
}
