import { renderHook, act } from '@testing-library/react';
import { useSearchFilters } from '~/hooks/useSearchFilters';
import type { SortOptions, FilterState } from '~/lib/types'; // Removed Severity
import { PostSeverity } from '@prisma/client'; // Added PostSeverity
// Assuming Post type might be from Prisma Client as well, or a generated path
// For consistency, if Post is from '~/generated/prisma', PostSeverity might also be.
// Let's assume PostSeverity is directly from @prisma/client for tests.

// Mocking fetch globally for tests in this file
let mockFetch: jest.SpyInstance;

beforeEach(() => {
  mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => [],
  } as Response);
  // Mock debounce to execute immediately
  jest.useFakeTimers();
});

afterEach(() => {
  mockFetch.mockRestore();
  jest.useRealTimers();
  jest.clearAllMocks(); // Clear all mocks after each test
});

const runAllTimers = () => {
  act(() => {
    jest.runAllTimers();
  });
};

describe('useSearchFilters', () => {
  it('should initialize with default state', () => {
    const { result } = renderHook(() => useSearchFilters());

    expect(result.current.searchTerm).toBe('');
    expect(result.current.severity).toBeNull();
    expect(result.current.selectedSpaceIds).toEqual([]);
    expect(result.current.myPostsOnly).toBe(false);
    expect(result.current.adminOnly).toBe(false);
    expect(result.current.sortOptions).toEqual({
      orderBy: 'date',
      orderDirection: 'desc',
      groupBySpace: false,
    });
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should update searchTerm', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => {
      result.current.setSearchTerm('test query');
    });
    expect(result.current.searchTerm).toBe('test query');
  });

  it('should update severity', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => {
      result.current.setSeverity(PostSeverity.High);
    });
    expect(result.current.severity).toBe(PostSeverity.High);
  });

  it('should update selectedSpaceIds', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => {
      result.current.setSelectedSpaceIds(['space1', 'space2']);
    });
    expect(result.current.selectedSpaceIds).toEqual(['space1', 'space2']);
  });

  it('should update myPostsOnly', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => {
      result.current.setMyPostsOnly(true);
    });
    expect(result.current.myPostsOnly).toBe(true);
  });

  it('should update adminOnly', () => {
    const { result } = renderHook(() => useSearchFilters());
    act(() => {
      result.current.setAdminOnly(true);
    });
    expect(result.current.adminOnly).toBe(true);
  });

  it('should update sortOptions', () => {
    const { result } = renderHook(() => useSearchFilters());
    const newSortOptions: SortOptions = {
      orderBy: 'title',
      orderDirection: 'asc',
      groupBySpace: true,
    };
    act(() => {
      result.current.setSortOptions(newSortOptions);
    });
    expect(result.current.sortOptions).toEqual(newSortOptions);
  });

  it('should call fetch with correct parameters when searchTerm changes', async () => {
    const { result } = renderHook(() => useSearchFilters());
    
    act(() => {
      result.current.setSearchTerm('search term');
    });
    runAllTimers(); 

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Updated endpoint
    const expectedUrl = '/api/dashboard-filter?q=search%20term&myPostsOnly=false&adminOnly=false&orderBy=date&orderDirection=desc&groupBySpace=false';
    expect(mockFetch).toHaveBeenCalledWith(expectedUrl);
  });

  it('should call fetch when severity changes', async () => {
    const { result } = renderHook(() => useSearchFilters());
    
    act(() => {
      result.current.setSeverity(PostSeverity.Medium); // Updated to PostSeverity
    });
    runAllTimers();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Updated endpoint and severity value
    const expectedUrl = '/api/dashboard-filter?severity=Medium&myPostsOnly=false&adminOnly=false&orderBy=date&orderDirection=desc&groupBySpace=false';
    expect(mockFetch).toHaveBeenCalledWith(expectedUrl);
  });
  
  it('should call fetch when selectedSpaceIds change', async () => {
    const { result } = renderHook(() => useSearchFilters());
    
    act(() => {
      result.current.setSelectedSpaceIds(['s1']);
    });
    runAllTimers();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Updated endpoint
    const expectedUrl = '/api/dashboard-filter?spaceIds=s1&myPostsOnly=false&adminOnly=false&orderBy=date&orderDirection=desc&groupBySpace=false';
    expect(mockFetch).toHaveBeenCalledWith(expectedUrl);
  });

  it('should call fetch when myPostsOnly changes', async () => {
    const { result } = renderHook(() => useSearchFilters());
    
    act(() => {
      result.current.setMyPostsOnly(true);
    });
    runAllTimers();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Updated endpoint
    const expectedUrl = '/api/dashboard-filter?myPostsOnly=true&adminOnly=false&orderBy=date&orderDirection=desc&groupBySpace=false';
    expect(mockFetch).toHaveBeenCalledWith(expectedUrl);
  });

  it('should call fetch when adminOnly changes', async () => {
    const { result } = renderHook(() => useSearchFilters());
    
    act(() => {
      result.current.setAdminOnly(true);
    });
    runAllTimers();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Updated endpoint
    const expectedUrl = '/api/dashboard-filter?adminOnly=true&myPostsOnly=false&orderBy=date&orderDirection=desc&groupBySpace=false';
    expect(mockFetch).toHaveBeenCalledWith(expectedUrl);
  });

  it('should call fetch when sortOptions change', async () => {
    const { result } = renderHook(() => useSearchFilters());
    const newSortOptions: SortOptions = { orderBy: 'title', orderDirection: 'asc', groupBySpace: true };
    
    act(() => {
      result.current.setSortOptions(newSortOptions);
    });
    runAllTimers();
    
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Updated endpoint
    const expectedUrl = '/api/dashboard-filter?myPostsOnly=false&adminOnly=false&orderBy=title&orderDirection=asc&groupBySpace=true';
    expect(mockFetch).toHaveBeenCalledWith(expectedUrl);
  });

  it('should not call fetch if search term is empty and no other filters are active', async () => {
    renderHook(() => useSearchFilters());
    runAllTimers();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should correctly build query with multiple active filters', async () => {
    const { result } = renderHook(() => useSearchFilters());
    
    act(() => {
      result.current.setSearchTerm('query');
      result.current.setSeverity(PostSeverity.High); // Updated to PostSeverity
      result.current.setSelectedSpaceIds(['s1', 's2']);
      result.current.setMyPostsOnly(true);
      result.current.setSortOptions({ orderBy: 'title', orderDirection: 'asc', groupBySpace: false });
    });
    runAllTimers();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Updated endpoint and severity value
    const expectedUrl = '/api/dashboard-filter?q=query&severity=High&spaceIds=s1%2Cs2&myPostsOnly=true&adminOnly=false&orderBy=title&orderDirection=asc&groupBySpace=false';
    expect(mockFetch).toHaveBeenCalledWith(expectedUrl);
  });

  it('should update results and loading state on successful fetch', async () => {
    const mockData = [{ id: '1', title: 'Test Post' }]; // Assuming Post type for results
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const { result } = renderHook(() => useSearchFilters());
    
    act(() => {
      result.current.setSearchTerm('test');
    });
    
    expect(result.current.loading).toBe(true); 
    
    runAllTimers(); 

    await act(async () => {
      await Promise.resolve(); 
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.results).toEqual(mockData);
  });

  it('should handle fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('API error'));
    const { result } = renderHook(() => useSearchFilters());

    act(() => {
      result.current.setSearchTerm('error test');
    });
    runAllTimers();

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.results).toEqual([]);
  });
});
