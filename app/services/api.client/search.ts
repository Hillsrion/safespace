import { useApi } from "~/hooks/use-api";
import { RESOURCES_API_PREFIX } from "~/lib/route-paths";

export interface SearchResultItemData {
  id: string;
  description?: string;
  name?: string;
  [key: string]: any;
}

export interface SearchResultItem {
  type: string;
  data: SearchResultItemData;
}

export type SearchResults = SearchResultItem[];

export interface SearchResponse {
  data: SearchResults;
  error?: string;
  code?: string;
}

export type SearchFilters = {
  type: "all" | "posts" | "entities";
  spaceId?: string;
  severity?: "low" | "medium" | "high";
  verification?: "unverified" | "pending" | "verified" | "disputed";
};

export function useSearchApi() {
  const { callApi, ...rest } = useApi<SearchResults>();

  const search = async (query: string, filters: SearchFilters) => {
    const params = new URLSearchParams({ q: query, type: filters.type });
    if (filters.spaceId) params.set("spaceId", filters.spaceId);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.verification) params.set("verification", filters.verification);

    return callApi(
      `/${RESOURCES_API_PREFIX}/search?${params.toString()}`,
      {
        method: "GET",
      }
    );
  };

  return {
    search,
    ...rest,
  };
}
