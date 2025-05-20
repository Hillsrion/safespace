import * as React from "react"
import { Link } from "react-router"
import {
  LogOutIcon,
  UserIcon,
  UsersIcon,
  ShieldIcon,
  FolderIcon
} from "lucide-react"

import { NavSpaces } from "~/components/nav-spaces"
import { NavMain } from "~/components/nav-main"
import { NavSecondary } from "~/components/nav-secondary"
import { NavUser } from "~/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"
import { logout } from "~/lib/api"

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Mes posts",
      url: "/dashboard/posts",
      icon: FolderIcon,
    },
    {
      title: "Contributions",
      url: "/dashboard/contributions",
      icon: FolderIcon,
    },
    {
      title: "Blacklist",
      url: "/dashboard/blacklist",
      icon: UsersIcon,
    },
    {
      title: "Modération",
      url: "/dashboard/moderation",
      icon: ShieldIcon,
    },
  ],
  navSecondary: [
    {
      title: "Compte",
      url: "/account",
      icon: UserIcon,
    },
    {
      title: "Déconnexion",
      url: "/logout",
      icon: LogOutIcon,
      callback: (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        logout().catch(error => {
          console.error('Logout failed:', error);
          window.location.href = '/auth/login';
        });  
        return false;
      },
    },
  ],
  spaces: [
    {
      name: "Lyon",
      url: "#",
    },
    {
      name: "Paris",
      url: "#",
    },
    {
      name: "Model Agency Elitel",
      url: "#",
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link to="/dashboard">
                <span className="text-base font-semibold">SafeSpace</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSpaces items={data.spaces} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
