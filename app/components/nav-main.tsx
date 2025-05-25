import { MailIcon, PlusCircleIcon, ShieldCheckIcon, type LucideIcon } from "lucide-react"
import { useRouteLoaderData } from "@remix-run/react"
import type { User } from "~/generated/prisma"

import { Button } from "~/components/ui/button"
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
              <PlusCircleIcon />
              <span>Créer un post</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {user && user.isSuperAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="SuperAdmin Dashboard" href="/dashboard/superadmin">
                <ShieldCheckIcon />
                <span>SuperAdmin Dashboard</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton tooltip={item.title} href={item.url}>
                {item.icon && <item.icon />}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
