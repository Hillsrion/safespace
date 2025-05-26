import {
  LogOutIcon,
  UserIcon,
  UsersIcon,
  SparkleIcon,
  PlusIcon,
} from "lucide-react";
import { logout } from "~/lib/api";
import { useSpaces } from "~/hooks/useSpaces";

export const useSidebarNav = () => {
  const { spaces } = useSpaces();

  const data = {
    user: {
      name: "shadcn",
      email: "m@example.com",
      avatar: "/avatars/shadcn.jpg",
    },
    navMain: [
      {
        title: "Créer un espace",
        url: "/dashboard/spaces/new",
        icon: PlusIcon,
      },
      {
        title: "Blacklist",
        url: "/dashboard/blacklist",
        icon: UsersIcon,
      },
      {
        title: "Chat AI",
        url: "/dashboard/ai",
        icon: SparkleIcon,
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
        url: "/logout",
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
