import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/components/ui/avatar"
import {
  SidebarMenu,
  SidebarMenuItem,
} from "~/components/ui/sidebar"
import type { EnhancedUser } from "~/lib/types"

export function NavUser({
  user,
}: EnhancedUser
) {
  const initials = user.firstName?.charAt(0).toUpperCase() + user.lastName?.charAt(0).toUpperCase()
  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex items-center gap-2 p-2">
        <Avatar className="h-8 w-8 rounded-lg grayscale">
          <AvatarImage src={user.avatar} alt={user.name} />
          <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
        </Avatar>
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {user.email}
          </span>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
