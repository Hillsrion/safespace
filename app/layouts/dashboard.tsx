import { Outlet, useMatches, Link } from "react-router";
import { SidebarProvider } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { useMeta } from "~/hooks/useMeta";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";


interface BreadcrumbItem {
  path: string;
  name: string;
}

interface RouteMatch {
  pathname: string;
  handle?: {
    crumb: string;
  };
}

export default function DashboardLayout() {
  const { title } = useMeta();
  const matches = useMatches() as unknown as RouteMatch[];
  // Only show breadcrumb for dashboard routes
  const isDashboardRoute = matches.some(match => match.pathname.startsWith('/dashboard'));
  
  if (!isDashboardRoute) {
    return (
      <SidebarProvider>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <main className="flex-1 overflow-auto p-4">
            <Outlet />
          </main>
        </div>
      </SidebarProvider>
    );
  }

  const pathnames: BreadcrumbItem[] = [];
  const currentRoute = matches[matches.length - 1];
  
  // Only add dashboard if we're not on the dashboard
  if (currentRoute.pathname !== '/dashboard') {
    pathnames.push({
      path: '/dashboard',
      name: 'Tableau de bord'
    });
  }
  
  // Add current route if it's not the dashboard and has a crumb
  if (currentRoute.handle?.crumb) {
    pathnames.push({
      path: currentRoute.pathname,
      name: currentRoute.handle.crumb
    });
  }
  console.log(currentRoute.pathname);
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto p-4">
          <div className="flex flex-col w-full mb-6 border-b border-gray-200 pb-4">
            <div className="flex items-center space-x-2">
              <SidebarTrigger />
              {pathnames.length > 0 && (
                <>
                  <div className="h-5 w-px bg-gray-300" />
                  <div>
                    <Breadcrumb>
                      <BreadcrumbList>
                        {currentRoute.pathname !== '/dashboard/' && (
                          <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                              <Link to="/dashboard" className="text-sm hover:underline font-medium">
                                Tableau de bord
                              </Link>
                            </BreadcrumbLink>
                          </BreadcrumbItem>
                        )}
                        {pathnames.length > 1 && (
                          <>
                            {currentRoute.pathname !== '/dashboard/' && <BreadcrumbSeparator />}
                            <BreadcrumbItem>
                              <BreadcrumbPage className="text-sm font-medium">
                                {pathnames[pathnames.length - 1].name}
                              </BreadcrumbPage>
                            </BreadcrumbItem>
                          </>
                        )}
                      </BreadcrumbList>
                    </Breadcrumb>
                  </div>
                </>
              )}
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
