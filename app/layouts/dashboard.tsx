import { Outlet, useMatches, Link, useLoaderData } from "react-router";
import { SidebarProvider } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar";
import { SidebarTrigger } from "~/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { ModeToggle } from "~/components/mode-toggle";
import { useToastTrigger } from "~/hooks/use-toast-trigger";
import { commitSession, getSession } from "~/services/session.server";

interface RouteMatch {
  pathname: string;
  handle?: {
    crumb?: string;
  };
}

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request);
  const toastData = session.get("toast");
  
  // Clear the toast after reading
  if (toastData) {
    session.unset("toast");
  }

  return { 
    toast: toastData || null,
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  };
}

export default function DashboardLayout() {
  const matches = useMatches() as unknown as RouteMatch[];
  const { toast: toastData } = useLoaderData<typeof loader>();
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

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto p-4">
          <div className="flex flex-col w-full mb-6 border-b border-gray-200 pb-4">
            <div className="flex items-center">
              <SidebarTrigger />
              <div className="h-5 w-px bg-gray-300 mx-3" />
              
              <div className="flex-grow">
                <Breadcrumb>
                  <BreadcrumbList>
                    {currentRoute.pathname !== '/dashboard' && currentRoute.pathname !== '/dashboard/' && (
                      <>
                        <BreadcrumbItem>
                          <BreadcrumbLink asChild>
                            <Link to="/dashboard" className="text-sm hover:underline font-medium">
                              Tableau de bord
                            </Link>
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        {currentRoute.handle?.crumb && <BreadcrumbSeparator />}
                      </>
                    )}
                    
                    {currentRoute.handle?.crumb && (
                      <BreadcrumbItem>
                        <BreadcrumbPage className="text-sm font-medium">
                          {currentRoute.handle.crumb}
                        </BreadcrumbPage>
                      </BreadcrumbItem>
                    )}

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

              <div className="ml-4">
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
