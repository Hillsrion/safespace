import { useEffect, useState, useCallback } from "react";
import { useUser } from "~/hooks/useUser";

interface Space {
  id: string;
  name: string;
  role: string;
}

interface ApiResponse {
  spaces: Space[];
  error?: string;
}

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
      const response = await fetch("/resources/api/spaces", {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ApiResponse = await response.json();

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
