import { useEffect, useState } from "react";
import { spaceRepository } from "~/db";
import { useUser } from "~/hooks/useUser";

export interface SpaceNavItem {
  id: string;
  name: string;
  url: string;
}

export const useSpaces = () => {
  const [spaces, setSpaces] = useState<SpaceNavItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const user = useUser();

  useEffect(() => {
    if (user && user.id) {
      setIsLoading(true);
      spaceRepository.getUserSpaces(user.id)
        .then(userSpaces => {
          const formattedSpaces = userSpaces.map(space => ({
            id: space.id,
            name: space.name,
            url: `/dashboard/spaces/${space.id}`,
          }));
          setSpaces(formattedSpaces);
        })
        .catch(error => {
          console.error("Failed to fetch user spaces:", error);
          setSpaces([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setSpaces([]);
      setIsLoading(false);
    }
  }, [user, user?.id]);

  return { spaces, isLoading };
};
