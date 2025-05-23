import {
  LogOutIcon,
  UserIcon,
  UsersIcon,
  ShieldIcon,
  FolderIcon,
  SparkleIcon,
} from "lucide-react";
import { logout } from "~/lib/api";
import { useSpaces, type SpaceNavItem } from '~/hooks/useSpaces';

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
        title: "Mes posts",
        url: "/dashboard/posts",
        icon: FolderIcon,
      },
      {
        title: "Contributions",
        url: "/dashboard/contributions",
        icon: FolderIcon,
      },
      {
        title: "Blacklist",
        url: "/dashboard/blacklist",
        icon: UsersIcon,
      },
      {
        title: "Modération",
        url: "/dashboard/moderation",
        icon: ShieldIcon,
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
