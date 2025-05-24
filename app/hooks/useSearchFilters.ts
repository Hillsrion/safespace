import { useState, useEffect, useCallback } from 'react';
import debounce from 'lodash-es/debounce';
import type { FilterState, SortOptions, Space } from '~/lib/types'; // Removed Severity
import type { Post, PostSeverity } from '~/generated/prisma'; // Assuming Post type is available and PostSeverity is from Prisma
// If PostSeverity is directly from @prisma/client, the import would be:
// import { PostSeverity } from '@prisma/client';
// For this change, assuming PostSeverity is co-located or re-exported with Post from a generated path.
// If not, the import { PostSeverity } from '@prisma/client' should be added separately.

// This would be the actual type for items in results, e.g., Post
// For now, using Post[] but could be a union if multiple result types are possible.
type SearchResultItem = Post; 

export function useSearchFilters(initialFilterState?: Partial<FilterState>) {
  const [searchTerm, setSearchTerm] = useState(initialFilterState?.searchTerm || '');
  // Use PostSeverity from Prisma for the severity state
  const [severity, setSeverity] = useState<PostSeverity | null>(initialFilterState?.severity || null);
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>(initialFilterState?.spaceIds || []);
  const [myPostsOnly, setMyPostsOnly] = useState(initialFilterState?.myPostsOnly || false);
  const [adminOnly, setAdminOnly] = useState(initialFilterState?.adminOnly || false);
  const [sortOptions, setSortOptions] = useState<SortOptions>(
    initialFilterState?.sortOptions || { orderBy: 'date', orderDirection: 'desc', groupBySpace: false }
  );

  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Part 1: Modify useSearchFilters.ts
  // Update fetchResults function signature and query parameter construction
  const fetchResults = useCallback(async (
    currentSearchTerm: string,
    currentFilters: Omit<FilterState, 'results' | 'loading' | 'searchTerm' | 'sortOptions'> & { sortOptions: SortOptions }
  ) => {
    // Condition to prevent API call if no meaningful filters are set
    // (e.g., empty search term, no severity, no space IDs, etc.)
    // This check can be adjusted based on desired behavior for "empty" filter states
    if (
      !currentSearchTerm.trim() &&
      !currentFilters.severity &&
      (!currentFilters.selectedSpaceIds || currentFilters.selectedSpaceIds.length === 0) &&
      !currentFilters.myPostsOnly &&
      !currentFilters.adminOnly
      // sortOptions always has a value, so not checked here for emptiness
    ) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const queryParams = new URLSearchParams();
    if (currentSearchTerm.trim()) { // Ensure not to add empty 'q'
        queryParams.append('q', encodeURIComponent(currentSearchTerm.trim()));
    }
    if (currentFilters.severity) {
      queryParams.append('severity', currentFilters.severity);
    }
    if (currentFilters.selectedSpaceIds && currentFilters.selectedSpaceIds.length > 0) {
      queryParams.append('spaceIds', currentFilters.selectedSpaceIds.join(','));
    }
    // Consistently append boolean filters as strings
    queryParams.append('myPostsOnly', String(currentFilters.myPostsOnly));
    queryParams.append('adminOnly', String(currentFilters.adminOnly));
    
    // Append sortOptions
    queryParams.append('orderBy', currentFilters.sortOptions.orderBy);
    queryParams.append('orderDirection', currentFilters.sortOptions.orderDirection);
    queryParams.append('groupBySpace', String(currentFilters.sortOptions.groupBySpace));

    try {
      // Updated API endpoint
      const response = await fetch(`/api/dashboard-filter?${queryParams.toString()}`);
      if (!response.ok) {
        console.error(`Search API request failed with status: ${response.status}, Body: ${await response.text()}`);
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
      const data: SearchResultItem[] = await response.json();
      setResults(data);
    } catch (error) {
      console.error("Failed to fetch search results:", error);
      setResults([]); // Clear results on error to avoid displaying stale data
    } finally {
      setLoading(false);
    }
  }, []); // fetchResults itself doesn't depend on component state, so empty deps array is fine.

  const debouncedFetchResults = useCallback(
    debounce((
      sTerm: string,
      // This type should match what fetchResults expects for its second argument
      filters: Omit<FilterState, 'results' | 'loading' | 'searchTerm' | 'sortOptions'> & { sortOptions: SortOptions }
    ) => {
      fetchResults(sTerm, filters);
    }, 500),
    [fetchResults] // Dependency: fetchResults (which is stable)
  );

  useEffect(() => {
    // This effect orchestrates calling debouncedFetchResults when any filter state changes.
    // Construct the filters object as expected by debouncedFetchResults/fetchResults
    // The type of `severity` here will be PostSeverity | null.
    // If FilterState.severity is different, a type mismatch could occur when assigning `severity` to `currentFiltersForEffect.severity`.
    // However, the task is to update the hook's internal state first.
    // The type of currentFiltersForEffect.severity will implicitly be PostSeverity | null due to `severity`'s type.
    const currentFiltersForEffect: Omit<FilterState, 'results' | 'loading' | 'searchTerm' | 'sortOptions'> & { sortOptions: SortOptions } = {
      severity, // This is now PostSeverity | null
      selectedSpaceIds,
      myPostsOnly,
      adminOnly,
      sortOptions, // sortOptions is now explicitly part of this structured object
    };
    
    debouncedFetchResults(searchTerm, currentFiltersForEffect);

    return () => {
      debouncedFetchResults.cancel(); // Cleanup: cancel any pending debounced calls
    };
  }, [searchTerm, severity, selectedSpaceIds, myPostsOnly, adminOnly, sortOptions, debouncedFetchResults]);

  return {
    searchTerm,
    setSearchTerm,
    severity,
    setSeverity,
    selectedSpaceIds,
    setSelectedSpaceIds,
    myPostsOnly,
    setMyPostsOnly,
    adminOnly,
    setAdminOnly,
    sortOptions,
    setSortOptions,
    results,
    loading,
    // If results are to be set from outside in some cases, expose setResults
    // setResults 
  };
}
