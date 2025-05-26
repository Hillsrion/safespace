import { PlusCircleIcon, ShieldCheckIcon, type LucideIcon } from "lucide-react"
import { useRouteLoaderData, Link } from "react-router"
import type { User } from "~/generated/prisma"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
  }[]
}) {
  const { user } = useRouteLoaderData("root") as { user: User }

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Quick Create"
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <PlusCircleIcon size={18}/>
              <span>Créer un post</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {user && user.isSuperAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="SuperAdmin Dashboard">
                <Link to="/dashboard/superadmin" className="flex items-center gap-2">
                  <ShieldCheckIcon size={18}/>
                  <span>SuperAdmin Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {items.map((item) => (  
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton tooltip={item.title}>
                <Link to={item.url} className="flex items-center gap-2">
                  {item.icon && <item.icon size={18} />}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
