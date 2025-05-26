"use client"

import { useState, type ComponentProps } from "react"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  FolderIcon,
  MoreHorizontalIcon,
  Trash2Icon,
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
import { LeaveSpaceDialog } from "~/components/ui/LeaveSpaceDialog"
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
  const [isLeaveSpaceDialogOpen, setIsLeaveSpaceDialogOpen] = useState(false)
  const [selectedSpaceToLeave, setSelectedSpaceToLeave] = useState<
    typeof items[0] | null
  >(null)

  const hasMore = items.length > MAX_VISIBLE_ITEMS
  const visibleItems = hasMore ? items.slice(0, MAX_VISIBLE_ITEMS) : items
  const moreItems = hasMore ? items.slice(MAX_VISIBLE_ITEMS) : []

  const handleOpenLeaveSpaceDialog = (item: typeof items[0]) => {
    setSelectedSpaceToLeave(item)
    setIsLeaveSpaceDialogOpen(true)
  }

  const handleCloseLeaveSpaceDialog = () => {
    setSelectedSpaceToLeave(null)
    setIsLeaveSpaceDialogOpen(false)
  }

  const handleConfirmLeaveSpace = async () => {
    if (!selectedSpaceToLeave) return

    console.log("Confirming leave for space: ", selectedSpaceToLeave)
    // Extract spaceId from selectedSpaceToLeave.url
    // Example: /dashboard/spaces/space_xyz -> space_xyz
    const spaceId = selectedSpaceToLeave.url.split("/").pop()

    if (!spaceId) {
      console.error("Could not extract spaceId from URL:", selectedSpaceToLeave.url)
      handleCloseLeaveSpaceDialog()
      return
    }

    try {
      const response = await fetch(`/api/spaces/${spaceId}/leave`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(`Error leaving space: ${response.statusText}`)
      }

      const result = await response.json()
      console.log("Successfully left space:", result)
    } catch (error) {
      console.error("Failed to leave space:", error)
    } finally {
      handleCloseLeaveSpaceDialog()
    }
  }

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
          <DropdownMenuItem
            onClick={() => handleOpenLeaveSpaceDialog(item)}
            className="cursor-pointer"
          >
            <Trash2Icon className="mr-2 h-4 w-4" />
            <span>Quitter l'espace</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )

  return (
    <>
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
      <LeaveSpaceDialog
        isOpen={isLeaveSpaceDialogOpen}
        onClose={handleCloseLeaveSpaceDialog}
        onConfirm={handleConfirmLeaveSpace}
      />
    </>
  )
}
