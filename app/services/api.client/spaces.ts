import { useApi } from "~/hooks/use-api";
import type { Space } from "~/generated/prisma";

export type TSpace = Pick<Space, "id" | "name">;

export interface SpacesResponse {
  spaces: TSpace[];
  error?: string;
  code?: string;
}

export function useSpacesApi() {
  const { callApi, ...rest } = useApi<SpacesResponse>();

  const getUserSpaces = async () => {
    return callApi("/resources/api/spaces", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  return {
    getUserSpaces,
    ...rest,
  };
}
