import { getCurrentUser } from "~/services/auth.server";
import { getTotalUsers } from "~/db/repositories/users.server";
import { getTotalSpaces } from "~/db/repositories/spaces/queries.server";
import { getTotalPosts } from "~/db/repositories/posts/queries.server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";
import { Link, redirect, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { Button } from "~/components/ui/button";
import { SuperAdminSpaceActions } from "~/components/superadmin-space-actions";
import { listAdminAuditLogs, listAdminSpaces } from "~/services/superadmin-space.server";
import { listAdminUsers } from "~/services/superadmin-user.server";

export const handle = {
  crumb: "SuperAdmin Dashboard",
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);

  if (!user) {
    return redirect("/auth/login");
  }

  if (!user.isSuperAdmin) {
    return redirect("/dashboard");
  }

  const [totalUsers, totalSpaces, totalPosts, spaces, auditLogs, users] = await Promise.all([
    getTotalUsers(),
    getTotalSpaces(),
    getTotalPosts(),
    listAdminSpaces(user, { limit: 50 }),
    listAdminAuditLogs(user, { limit: 50 }),
    listAdminUsers(user, { limit: 50 }),
  ]);

  return {
    totalUsers,
    totalSpaces,
    totalPosts,
    spaces: spaces.spaces,
    auditLogs: auditLogs.logs,
    users: users.users,
  };
}

export default function SuperAdminDashboard() {
  const { totalUsers, totalSpaces, totalPosts, spaces, auditLogs, users } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Administration globale</h1>
          <p className="text-sm text-muted-foreground">Espaces, activité et contrôles système.</p>
        </div>
        <Button asChild><Link to="/dashboard/spaces/new">Créer un espace</Link></Button>
        <Button asChild variant="outline"><Link to="/dashboard/superadmin/announcements">Annonces système</Link></Button>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Total Users</CardTitle>
          <CardDescription>The total number of registered users.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{totalUsers}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Total Spaces</CardTitle>
          <CardDescription>The total number of created spaces.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{totalSpaces}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Total Posts</CardTitle>
          <CardDescription>The total number of created posts.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{totalPosts}</p>
        </CardContent>
      </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Espaces</CardTitle><CardDescription>Suppression possible uniquement lorsqu’aucune donnée métier n’est liée.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="py-2">Nom</th><th>Membres</th><th>Rapports</th><th>Entités</th><th>Actions</th></tr></thead>
            <tbody>
              {spaces.map((space) => {
                const isEmpty = Object.values(space.counts).every((count) => count === 0);
                return (
                  <tr className="border-b" key={space.id}>
                    <td className="py-3"><Link className="font-medium hover:underline" to={`/dashboard/spaces/${space.id}`}>{space.name}</Link></td>
                    <td>{space.counts.members}</td><td>{space.counts.posts}</td><td>{space.counts.reportedEntities}</td>
                    <td className="py-2"><SuperAdminSpaceActions description={space.description} isEmpty={isEmpty} name={space.name} spaceId={space.id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Journal d’audit récent</CardTitle><CardDescription>Projection minimisée, sans contenu sensible.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="py-2">Date</th><th>Action</th><th>Type</th><th>Espace</th></tr></thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr className="border-b" key={log.id}>
                  <td className="py-2">{new Date(log.createdAt).toLocaleString("fr-FR")}</td>
                  <td>{log.action}</td><td>{log.targetEntityType || "—"}</td><td>{log.spaceId || "Global"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Utilisateurs</CardTitle>
          <CardDescription>
            Vue globale minimisée des comptes et de leur nombre d’adhésions.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Nom</th>
                <th>Email</th>
                <th>Espaces</th>
                <th>Type</th>
                <th>Création</th>
              </tr>
            </thead>
            <tbody>
              {users.map((listedUser) => (
                <tr className="border-b" key={listedUser.id}>
                  <td className="py-2">
                    {[listedUser.firstName, listedUser.lastName]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </td>
                  <td>{listedUser.email}</td>
                  <td>{listedUser.membershipCount}</td>
                  <td>{listedUser.isSuperAdmin ? "SuperAdmin" : "Membre"}</td>
                  <td>{new Date(listedUser.createdAt).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
