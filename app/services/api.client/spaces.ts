import type { Space } from "~/generated/prisma";

export type TSpace = Pick<Space, "id" | "name">;

export interface ApiResponse {
  spaces: TSpace[];
  error?: string;
}

export async function getUserSpaces(): Promise<ApiResponse> {
  const response = await fetch("/resources/api/spaces", {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}
