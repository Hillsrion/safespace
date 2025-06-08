import { useState, useEffect, useCallback } from "react";
import debounce from "lodash-es/debounce";
import { useSearchApi } from "~/services/api.client/search";
import type { SearchResults } from "~/services/api.client/search";

// Define types for results based on the API response structure
// The API returns an array of objects, each with a 'type' and 'data' field.
// 'data' can be of various shapes (Post, ReportedEntity, etc.)
interface SearchResultItemData {
  id: string;
  // Common fields, specific fields depend on the 'type'
  description?: string; // For Post
  name?: string; // For ReportedEntity
  // Add other potential fields from different data types if known, or keep it general
  [key: string]: any;
}

interface SearchResultItem {
  type: string; // e.g., "post", "reportedEntity"
  data: SearchResultItemData;
}

export function useSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const { search } = useSearchApi();

  const fetchResults = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await search(query);
      if (!response.data) {
        setResults(null);
        return;
      }
      setResults(response.data);
    } catch (error) {
      console.error("Failed to fetch search results:", error);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedFetchResults = useCallback(debounce(fetchResults, 500), [
    fetchResults,
  ]);

  useEffect(() => {
    debouncedFetchResults(searchTerm);

    return () => {
      debouncedFetchResults.cancel();
    };
  }, [searchTerm, debouncedFetchResults]);

  return { searchTerm, setSearchTerm, results, loading };
}
