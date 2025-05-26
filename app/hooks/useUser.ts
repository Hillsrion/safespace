import { useMatches } from "react-router";
import { useMemo } from "react";
import type { EnhancedUser } from "~/lib/types";
import type { UIMatch } from "react-router";
import { getRole } from "~/lib/utils";

type RouteDataWithUser = {
  user: EnhancedUser | null;
  [key: string]: unknown;
};

type RouteMatch = UIMatch<RouteDataWithUser, unknown>;

export function useUser(): EnhancedUser {
  const matches = useMatches() as RouteMatch[];

  const userData = useMemo(() => {
    const match = matches.find((match): match is RouteMatch => {
      return (
        match.data && typeof match.data === "object" && "user" in match.data
      );
    });

    return match?.data?.user ?? null;
  }, [matches]);

  if (!userData) {
    throw new Error(
      "User data not found. Ensure user is loaded in the route loader."
    );
  }

  const user = {
    ...userData,
    name: `${userData.firstName} ${userData.lastName}`,
    role: getRole(userData),
  };

  return user;
}
