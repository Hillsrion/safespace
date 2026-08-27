import { Link } from "react-router";
import { CommunityPolicy } from "~/components/community-policy";

export function meta() {
  return [{ title: "Charte de conduite | SafeSpace" }];
}

export default function CommunityPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <CommunityPolicy />
      <nav aria-label="Navigation de la charte" className="flex gap-6 border-t pt-4 text-sm">
        <Link className="underline" to="/auth/login">Connexion</Link>
        <Link className="underline" to="/dashboard">Retour à mes espaces</Link>
      </nav>
    </main>
  );
}
