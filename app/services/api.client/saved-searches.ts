import { RESOURCES_API_PREFIX } from "~/routes";
import type { SearchFilters } from "~/services/api.client/search";

export type SavedSearch = Omit<SearchFilters, "verification" | "spaceId" | "severity"> & {
  id: string;
  name: string;
  query: string;
  spaceId: string | null;
  severity: SearchFilters["severity"] | null;
  verificationStatus: SearchFilters["verification"] | null;
  alertEnabled: boolean;
  alertHandle: string | null;
  createdAt: string;
  updatedAt: string;
};

type SavedSearchesResponse = {
  success: true;
  savedSearches: SavedSearch[];
};

type SavedSearchResponse = {
  success: true;
  savedSearch: SavedSearch;
};

async function requireJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body.error === "string" ? body.error : "Request failed";
    throw new Error(message);
  }
  return body as T;
}

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const response = await fetch(`/${RESOURCES_API_PREFIX}/saved-searches`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return (await requireJson<SavedSearchesResponse>(response)).savedSearches;
}

export async function createSavedSearch(input: {
  name: string;
  query: string;
  type: SearchFilters["type"];
  spaceId?: string;
  severity?: SearchFilters["severity"];
  verificationStatus?: SearchFilters["verification"];
  alertEnabled: boolean;
  alertHandle?: string;
}): Promise<SavedSearch> {
  const response = await fetch(`/${RESOURCES_API_PREFIX}/saved-searches`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  return (await requireJson<SavedSearchResponse>(response)).savedSearch;
}
