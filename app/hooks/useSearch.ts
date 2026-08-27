import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import debounce from "lodash-es/debounce";

import {
  useSearchApi,
  type SearchFilters,
  type SearchResults,
} from "~/services/api.client/search";

/**
 * Client search state with two privacy and correctness guarantees:
 * closing clears previous results, and a response is accepted only when it
 * still belongs to the most recent query/filter snapshot.
 */
export function useSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({ type: "all" });
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const { search } = useSearchApi();
  const searchRef = useRef(search);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const fetchResults = useCallback(
    async (query: string, nextFilters: SearchFilters, version: number) => {
      if (!query.trim()) {
        if (version === requestVersion.current) {
          setResults(null);
          setLoading(false);
        }
        return;
      }

      if (version === requestVersion.current) setLoading(true);
      try {
        const response = await searchRef.current(query, nextFilters);
        if (version !== requestVersion.current) return;
        setResults(response.data ?? null);
      } catch {
        // API error text may include sensitive request context. The generic API
        // hook handles the user-facing message; this palette retains no data.
        if (version === requestVersion.current) setResults(null);
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    []
  );

  const debouncedFetchResults = useMemo(
    () => debounce(fetchResults, 300),
    [fetchResults]
  );

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!searchTerm.trim()) {
      debouncedFetchResults.cancel();
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    debouncedFetchResults(searchTerm, filters, version);
    return () => debouncedFetchResults.cancel();
  }, [searchTerm, filters, debouncedFetchResults]);

  useEffect(() => () => debouncedFetchResults.cancel(), [debouncedFetchResults]);

  const resetSearch = useCallback(() => {
    ++requestVersion.current;
    debouncedFetchResults.cancel();
    setSearchTerm("");
    setFilters({ type: "all" });
    setResults(null);
    setLoading(false);
  }, [debouncedFetchResults]);

  return {
    searchTerm,
    setSearchTerm,
    filters,
    setFilters,
    results,
    loading,
    resetSearch,
  };
}
