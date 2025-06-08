import { useApi } from "~/hooks/use-api";
import { RESOURCES_API_PREFIX } from "~/routes";

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

export function useSearchApi() {
  const { callApi, ...rest } = useApi<SearchResults>();

  const search = async (query: string) => {
    return callApi(
      `${RESOURCES_API_PREFIX}/search?q=${encodeURIComponent(query)}`,
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
