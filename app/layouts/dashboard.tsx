import { Outlet } from "react-router";
import { SidebarProvider } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { useMeta } from "~/hooks/useMeta";

export default function DashboardLayout() {
  const { title } = useMeta()
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto p-4">
          <div className="flex items-center w-full mb-6 border-b border-gray-200 pb-4">
            <SidebarTrigger />
            <div className="flex-1 ml-4">
              {title}
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
