import { useEffect, useState, useCallback } from "react";
import { useUser } from "~/hooks/useUser";
import { getUserSpaces } from "~/services/api.client/spaces";
import type { ApiResponse } from "~/services/api.client/spaces";

export interface SpaceNavItem {
  id: string;
  name: string;
  url: string;
}

export const useSpaces = () => {
  const [spaces, setSpaces] = useState<SpaceNavItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const user = useUser();

  const fetchSpaces = useCallback(async () => {
    if (!user?.id) {
      setSpaces([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await getUserSpaces();

      if (data.error) {
        throw new Error(data.error);
      }

      const formattedSpaces = data.spaces.map((space) => ({
        id: space.id,
        name: space.name,
        url: `/dashboard/spaces/${space.id}`,
      }));

      setSpaces(formattedSpaces);
    } catch (err) {
      console.error("Failed to fetch spaces:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch spaces");
      setSpaces([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  // Function to manually refresh spaces if needed
  const refresh = useCallback(() => {
    return fetchSpaces();
  }, [fetchSpaces]);

  return {
    spaces,
    isLoading,
    error,
    refresh,
  };
};
