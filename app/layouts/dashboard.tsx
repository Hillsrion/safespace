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
import { ModeToggle } from "~/components/mode-toggle"; // Added import

interface BreadcrumbItemType { // Renamed to avoid conflict with BreadcrumbItem component
  path: string;
  name: string;
}

interface RouteMatch {
  pathname: string;
  handle?: {
    crumb?: string; // Made crumb optional as it might not always be present
  };
}

export default function DashboardLayout() {
  const { title } = useMeta(); // title is declared but not used, consider removing if not needed.
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

  const currentRoute = matches[matches.length - 1];
  // console.log(currentRoute.pathname); // Original console.log

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto p-4">
          <div className="flex flex-col w-full mb-6 border-b border-gray-200 pb-4">
            {/* Header section with SidebarTrigger, Breadcrumbs, and ModeToggle */}
            <div className="flex items-center"> {/* Main flex container for header items */}
              <SidebarTrigger />
              <div className="h-5 w-px bg-gray-300 mx-3" /> {/* Separator with margin */}
              
              {/* Breadcrumb container */}
              <div className="flex-grow"> {/* Allow breadcrumb to take available space */}
                <Breadcrumb>
                  <BreadcrumbList>
                    {/* Case 1: Not on /dashboard or /dashboard/ (i.e., a subpage like /dashboard/settings) */}
                    {currentRoute.pathname !== '/dashboard' && currentRoute.pathname !== '/dashboard/' && (
                      <>
                        <BreadcrumbItem>
                          <BreadcrumbLink asChild>
                            <Link to="/dashboard" className="text-sm hover:underline font-medium">
                              Tableau de bord
                            </Link>
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        {/* Show separator only if there's a crumb for the current sub-page */}
                        {currentRoute.handle?.crumb && <BreadcrumbSeparator />}
                      </>
                    )}
                    
                    {/* Current Page Name (from crumb) - shows on subpages or if /dashboard has a crumb */}
                    {currentRoute.handle?.crumb && (
                      <BreadcrumbItem>
                        <BreadcrumbPage className="text-sm font-medium">
                          {currentRoute.handle.crumb}
                        </BreadcrumbPage>
                      </BreadcrumbItem>
                    )}

                    {/* Case 2: On /dashboard or /dashboard/ AND no specific crumb (is the dashboard index itself) */}
                    {(currentRoute.pathname === '/dashboard' || currentRoute.pathname === '/dashboard/') && !currentRoute.handle?.crumb && (
                       <BreadcrumbItem>
                         <BreadcrumbPage className="text-sm font-medium">
                           Tableau de bord
                         </BreadcrumbPage>
                       </BreadcrumbItem>
                    )}
                  </BreadcrumbList>
                </Breadcrumb>
              </div>

              {/* ModeToggle pushed to the right */}
              <div className="ml-4"> {/* Margin to separate from breadcrumbs/flex-grow */}
                <ModeToggle />
              </div>
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
