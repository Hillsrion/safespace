import { Outlet } from "react-router";
import { SidebarProvider } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar";

export default function DashboardLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
