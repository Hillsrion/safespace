import {
  LogOutIcon,
  UserIcon,
  UsersIcon,
  PlusIcon,
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
