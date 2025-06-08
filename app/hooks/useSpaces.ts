import { useCallback, useEffect } from "react";
import { useSpacesApi, type TSpace } from "~/services/api.client/spaces";

export interface SpaceNavItem {
  id: string;
  name: string;
  url: string;
}

export const useSpaces = () => {
  const { getUserSpaces, isLoading, error, data } = useSpacesApi();
  const fetchSpaces = useCallback(getUserSpaces, []);

  useEffect(() => {
    fetchSpaces();
  }, []);

  // Format spaces data when it changes
  const spaces: SpaceNavItem[] =
    data?.spaces?.map((space: TSpace) => ({
      id: space.id,
      name: space.name,
      url: `/dashboard/spaces/${space.id}`,
    })) || [];

  return {
    spaces,
    isLoading,
    error,
    refresh: fetchSpaces,
  };
};
