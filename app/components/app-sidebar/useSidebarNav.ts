import {
  LogOutIcon,
  UserIcon,
  UsersIcon,
  PlusIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { useSpaces } from "~/hooks/useSpaces";
import { useAuthApi } from "~/services/api.client/auth";
import type { EnhancedUser } from "~/lib/types";

export const useSidebarNav = (user: EnhancedUser) => {
  const { spaces } = useSpaces();
  const { logout } = useAuthApi();
  const data = {
    user: {
      name: "shadcn",
      email: "m@example.com",
      avatar: "/avatars/shadcn.jpg",
    },
    navMain: [
      ...(user.isSuperAdmin ? [{
        title: "Créer un espace",
        url: "/dashboard/spaces/new",
        icon: PlusIcon,
      }] : []),
      ...((user.isSuperAdmin || spaces.some(({ role }) => {
        const normalized = role.trim().toUpperCase();
        return normalized === "ADMIN" || normalized === "MODERATOR";
      })) ? [{
        title: "Modération",
        url: "/dashboard/moderation",
        icon: ShieldAlertIcon,
      }, {
        title: "Revue des allégations sensibles",
        url: "/dashboard/sensitive-reviews",
        icon: ShieldAlertIcon,
      }] : []),
      {
        title: "Entités signalées",
        url: "/dashboard/entities",
        icon: UsersIcon,
      },
    ],
    navSecondary: [
      {
        title: "Compte",
        url: "/dashboard/account",
        icon: UserIcon,
      },
      {
        title: "Déconnexion",
        url: "/auth/logout",
        icon: LogOutIcon,
        callback: async (e: React.MouseEvent<HTMLButtonElement>) => {
          e.preventDefault();
          await logout();
        },
      },
    ],
    spaces: spaces,
  };

  return { data };
};
