"use client"

import { useState } from "react"
import { Link } from "react-router"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  FolderIcon,
  MoreHorizontalIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "~/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar"

const MAX_VISIBLE_ITEMS = 8;

export function NavSpaces({
  items,
}: {
  items: {
    name: string
    id: string
    url: string
    role: string
    icon?: LucideIcon
  }[]
}) {
  const { isMobile } = useSidebar()
  const [isExpanded, setIsExpanded] = useState(false)
  const hasMore = items.length > MAX_VISIBLE_ITEMS
  const visibleItems = hasMore ? items.slice(0, MAX_VISIBLE_ITEMS) : items
  const moreItems = hasMore ? items.slice(MAX_VISIBLE_ITEMS) : []

  const normalizedRole = (role: string) => role.trim().toUpperCase().replaceAll("-", "_")
  const canManageMembers = (role: string) => normalizedRole(role) === "ADMIN"
  const canCreateReports = (role: string) =>
    ["ADMIN", "MODERATOR", "EDITOR"].includes(normalizedRole(role))

  const renderSpaceItem = (item: typeof items[0], index: number) => (
    <SidebarMenuItem key={`${item.name}-${index}`}>
      <SidebarMenuButton asChild>
        <Link to={item.url} className="w-full">
          {item.icon && <item.icon className="h-4 w-4" />}
          <span className="truncate">{item.name}</span>
        </Link>
      </SidebarMenuButton>
      {(canManageMembers(item.role) || canCreateReports(item.role)) && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            showOnHover
            className="rounded-sm data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">Options</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-32 rounded-lg"
          side={isMobile ? "bottom" : "right"}
          align={isMobile ? "end" : "start"}
        >
          {canManageMembers(item.role) && <DropdownMenuItem asChild>
            <Link to={`/dashboard/spaces/${encodeURIComponent(item.id)}`} className="cursor-pointer">
              <UsersIcon className="mr-2 h-4 w-4" />
              <span>Gérer les membres</span>
            </Link>
          </DropdownMenuItem>
          }
          {canCreateReports(item.role) && <DropdownMenuItem asChild>
            <Link to={`/dashboard/posts/new?spaceId=${encodeURIComponent(item.id)}`} className="cursor-pointer">
              <FolderIcon className="mr-2 h-4 w-4" />
              <span>Nouveau signalement</span>
            </Link>
          </DropdownMenuItem>
          }
        </DropdownMenuContent>
      </DropdownMenu>}
    </SidebarMenuItem>
  )

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Espaces</SidebarGroupLabel>
      <SidebarMenu>
        {visibleItems.map(renderSpaceItem)}
        
        {hasMore && (
          <>
            {isExpanded && moreItems.map(renderSpaceItem)}
            <SidebarMenuItem>
              <SidebarMenuButton 
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                  "text-sidebar-foreground/70 hover:bg-transparent hover:text-sidebar-foreground",
                  isExpanded && "text-sidebar-foreground"
                )}
              >
                {isExpanded ? (
                  <ChevronUpIcon className="h-4 w-4 text-sidebar-foreground/70" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4 text-sidebar-foreground/70" />
                )}
                <span>{isExpanded ? "Voir moins" : `Voir ${moreItems.length} de plus`}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
