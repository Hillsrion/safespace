import { redirect, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { SystemAnnouncementManager } from "~/components/system-announcement-manager";
import { getCurrentUser } from "~/services/auth.server";
import { listSystemAnnouncements } from "~/services/system-announcements.server";

export const handle = { crumb: "Annonces système" };
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
  if (!user) throw redirect("/auth/login");
  if (!user.isSuperAdmin) throw redirect("/dashboard");
  return { announcements: await listSystemAnnouncements({ id: user.id }) };
}
export default function SuperAdminAnnouncementsPage() {
  const { announcements } = useLoaderData<typeof loader>();
  return <div className="space-y-4 p-4 md:p-6"><div><h1 className="text-2xl font-bold">Annonces système</h1><p className="text-sm text-muted-foreground">Visibles uniquement par les utilisateurs authentifiés pendant leur période active.</p></div><SystemAnnouncementManager announcements={announcements} /></div>;
}
