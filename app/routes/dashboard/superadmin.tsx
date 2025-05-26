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
import { redirect, useLoaderData } from "react-router";
import type { LoaderFunction } from "@remix-run/node";

export const handle = {
  crumb: "SuperAdmin Dashboard",
};

export const loader: LoaderFunction = async ({ request }) => {
  const user = await getCurrentUser(request);

  if (!user) {
    return redirect("/auth/login");
  }

  if (!user.isSuperAdmin) {
    return redirect("/dashboard");
  }

  const [totalUsers, totalSpaces, totalPosts] = await Promise.all([
    getTotalUsers(),
    getTotalSpaces(),
    getTotalPosts(),
  ]);

  return {
    totalUsers,
    totalSpaces,
    totalPosts,
  };
};

export default function SuperAdminDashboard() {
  const { totalUsers, totalSpaces, totalPosts } = useLoaderData();

  return (
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
  );
}
