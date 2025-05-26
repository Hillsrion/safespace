"use client"

import { useState } from "react"
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
    url: string
    icon?: LucideIcon
  }[]
}) {
  const { isMobile } = useSidebar()
  const [isExpanded, setIsExpanded] = useState(false)
  const hasMore = items.length > MAX_VISIBLE_ITEMS
  const visibleItems = hasMore ? items.slice(0, MAX_VISIBLE_ITEMS) : items
  const moreItems = hasMore ? items.slice(MAX_VISIBLE_ITEMS) : []

  const renderSpaceItem = (item: typeof items[0], index: number) => (
    <SidebarMenuItem key={`${item.name}-${index}`}>
      <SidebarMenuButton asChild>
        <a href={item.url} className="w-full">
          {item.icon && <item.icon className="h-4 w-4" />}
          <span className="truncate">{item.name}</span>
        </a>
      </SidebarMenuButton>
      <DropdownMenu>
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
          <DropdownMenuItem asChild>
            <a href={`${item.url}/users`} className="cursor-pointer">
              <UsersIcon className="mr-2 h-4 w-4" />
              <span>Utilisateurs</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`${item.url}/posts`} className="cursor-pointer">
              <FolderIcon className="mr-2 h-4 w-4" />
              <span>Posts</span>
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
