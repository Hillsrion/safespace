import { useState, useEffect, useCallback } from 'react';
import debounce from 'lodash-es/debounce';

// Define types for results based on the API response structure
// The API returns an array of objects, each with a 'type' and 'data' field.
// 'data' can be of various shapes (Post, ReportedEntity, etc.)
interface SearchResultItemData {
  id: string;
  // Common fields, specific fields depend on the 'type'
  description?: string; // For Post
  name?: string;        // For ReportedEntity
  // Add other potential fields from different data types if known, or keep it general
  [key: string]: any; 
}

interface SearchResultItem {
  type: string; // e.g., "post", "reportedEntity"
  data: SearchResultItemData;
}

type SearchResults = SearchResultItem[];

export function useSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResults>([]);
  const [loading, setLoading] = useState(false);

  // useCallback for fetchResults to memoize it unless dependencies change.
  // Here, it has no dependencies other than what's available in its scope (fetch, setResults, setLoading).
  const fetchResults = useCallback(async (query: string) => {
    if (!query.trim()) { // Check if the query is empty or just whitespace
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        // You might want to handle different HTTP error statuses differently
        console.error(`Search API request failed with status: ${response.status}`);
        throw new Error('Network response was not ok');
      }
      const data: SearchResults = await response.json();
      setResults(data); // API returns an array directly
    } catch (error) {
      console.error("Failed to fetch search results:", error);
      setResults([]); // Clear results on error to avoid displaying stale/incorrect data
    } finally {
      setLoading(false);
    }
  }, []); // Empty dependency array as fetchResults doesn't depend on props/state from useSearch's scope directly

  // useCallback for debouncedFetchResults to memoize the debounced function.
  // The dependency array includes fetchResults, so if fetchResults changes, the debounced function is recreated.
  const debouncedFetchResults = useCallback(debounce(fetchResults, 500), [fetchResults]);

  useEffect(() => {
    // Call the debounced function when searchTerm changes.
    // If searchTerm is empty, debouncedFetchResults will call fetchResults with an empty query,
    // which will then clear results and set loading to false.
    debouncedFetchResults(searchTerm);

    // Cleanup function:
    // This will be called when the component unmounts or before the effect runs again.
    // It's good practice to cancel any pending debounced calls to prevent them from
    // executing (e.g., updating state on an unmounted component).
    return () => {
      debouncedFetchResults.cancel();
    };
  }, [searchTerm, debouncedFetchResults]); // Effect dependencies

  return { searchTerm, setSearchTerm, results, loading };
}
