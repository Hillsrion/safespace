import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { EnhancedUser } from "./types";
import { USER_ROLES } from "./types";
import type { UserRoles } from "./types";
import type { User } from "~/generated/prisma";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getRole(user: EnhancedUser): UserRoles {
  if (user.isSuperAdmin) {
    return USER_ROLES.SUPERADMIN;
  } else if (user.role === USER_ROLES.MODERATOR) {
    return USER_ROLES.MODERATOR;
  } else if (user.role === USER_ROLES.ADMIN) {
    return USER_ROLES.ADMIN;
  } else {
    return USER_ROLES.USER;
  }
}

export function getUserIdentity(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}
