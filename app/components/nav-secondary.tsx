"use client"

import * as React from "react"
import { type LucideIcon } from "lucide-react"
import { Link } from "react-router"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: LucideIcon,
    callback?: (e: React.MouseEvent<HTMLButtonElement>) => boolean | void
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                {item.url ? (
                  <Link 
                    to={item.url}
                    onClick={(e) => {
                      if (item.callback) {
                        e.preventDefault();
                        item.callback(e as unknown as React.MouseEvent<HTMLButtonElement>);
                      }
                    }}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                ) : (
                  <button 
                    onClick={item.callback} 
                    className="w-full text-left"
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </button>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
