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

export async function getSearch(query: string): Promise<SearchResults> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}
