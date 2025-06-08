import { useApi } from "~/hooks/use-api";

export interface AuthResponse {
  success: boolean;
  error?: string;
  code?: string;
}

export function useAuthApi() {
  const { callApi, ...rest } = useApi<AuthResponse>();

  const logout = async () => {
    return callApi("/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
  };

  return {
    logout,
    ...rest,
  };
}
