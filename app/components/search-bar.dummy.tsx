import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom'; // Using MemoryRouter for navigation context
import { SearchBar } from './search-bar'; // Adjust path as necessary
// Mock fetch directly
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock useNavigate
const mockNavigate = vi.fn();

// Mocking @remix-run/react first as it's more specific to the project
vi.mock('@remix-run/react', async () => {
    const actual = await vi.importActual('@remix-run/react');
    return {
        ...(actual as any),
        useNavigate: () => mockNavigate,
    };
});

// Mock react-router-dom if it's also used for useNavigate, though Remix's should take precedence.
// If only Remix's useNavigate is used, this mock might be redundant but harmless.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...(actual as any),
    useNavigate: () => mockNavigate, // Fallback, Remix's should be primary
  };
});


beforeEach(() => {
  mockFetch.mockClear();
  mockNavigate.mockClear();
});

const mockSearchResults = [
  { type: 'post', data: { id: 'post1', description: 'Test Post 1' } },
  { type: 'reportedEntity', data: { id: 're1', name: 'Test Entity 1' } },
  { type: 'user', data: { id: 'user1', firstName: 'John', lastName: 'Doe' } },
];

describe('SearchBar Component', () => {
  const TestWrapper = ({ children } : {children: React.ReactNode}) => <MemoryRouter>{children}</MemoryRouter>;

  it('renders the search input', () => {
    render(<SearchBar />, { wrapper: TestWrapper });
    expect(screen.getByPlaceholderText('Search posts, entities, users...')).toBeInTheDocument();
  });

  it('fetches and displays results when user types', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearchResults,
    } as Response);

    render(<SearchBar />, { wrapper: TestWrapper });
    const input = screen.getByPlaceholderText('Search posts, entities, users...');
    await userEvent.type(input, 'test');

    // Wait for debouncing and API call
    await waitFor(() => {
      expect(screen.getByText('Test Post 1')).toBeInTheDocument();
    }, { timeout: 1000 });

    expect(screen.getByText('Test Entity 1')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/search?q=test');
  });

  it('shows "No results found" message when API returns empty array for a search term', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);
    
    render(<SearchBar />, { wrapper: TestWrapper });
    const input = screen.getByPlaceholderText('Search posts, entities, users...');
    await userEvent.type(input, 'nonexistent');
    
    await waitFor(() => {
      expect(screen.getByText(/No results found for "nonexistent"./i)).toBeInTheDocument();
    }, { timeout: 1000 });
    expect(mockFetch).toHaveBeenCalledWith('/api/search?q=nonexistent');
  });
  
  it('shows "Type to start searching." message when input is empty and not loading', async () => {
    render(<SearchBar />, { wrapper: TestWrapper });
    const input = screen.getByPlaceholderText('Search posts, entities, users...');
    
    // Focus the input to open the command list if it's designed to do so
    fireEvent.focus(input);

    // Initially, without typing, it should show "Type to start searching."
    await waitFor(() => {
        expect(screen.getByText("Type to start searching.")).toBeInTheDocument();
    });

    // Type something to get results
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSearchResults,
    } as Response);
    await userEvent.type(input, 'test');
     await waitFor(() => {
      expect(screen.getByText('Test Post 1')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledWith('/api/search?q=test');
    
    // Clear the input
    await userEvent.clear(input);
     await waitFor(() => {
        expect(screen.getByText("Type to start searching.")).toBeInTheDocument();
    });

  });


  it('navigates to the correct path when a post result is selected', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [mockSearchResults[0]], // Return only post
    } as Response);

    render(<SearchBar />, { wrapper: TestWrapper });
    const input = screen.getByPlaceholderText('Search posts, entities, users...');
    await userEvent.type(input, 'Test Post 1');

    await waitFor(() => screen.getByText('Test Post 1'));
    
    // Click the item. Use the text content to find it.
    // `CommandItem` might not directly be a button, so we find by text and click its parent or the item itself.
    const resultItem = screen.getByText('Test Post 1');
    await userEvent.click(resultItem);
    
    expect(mockNavigate).toHaveBeenCalledWith('/posts/post1');
    expect(mockFetch).toHaveBeenCalledWith('/api/search?q=Test Post 1');
  });

  it('navigates to the correct path when a reported entity result is selected', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [mockSearchResults[1]], // Return only entity
    } as Response);

    render(<SearchBar />, { wrapper: TestWrapper });
    await userEvent.type(screen.getByPlaceholderText('Search posts, entities, users...'), 'Test Entity 1');
    await waitFor(() => screen.getByText('Test Entity 1'));
    await userEvent.click(screen.getByText('Test Entity 1'));
    expect(mockNavigate).toHaveBeenCalledWith('/reported-entities/re1');
    expect(mockFetch).toHaveBeenCalledWith('/api/search?q=Test Entity 1');
  });

  it('navigates to the correct path when a user result is selected', async () => {
     mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [mockSearchResults[2]], // Return only user
    } as Response);

    render(<SearchBar />, { wrapper: TestWrapper });
    await userEvent.type(screen.getByPlaceholderText('Search posts, entities, users...'), 'John Doe');
    await waitFor(() => screen.getByText('John Doe'));
    await userEvent.click(screen.getByText('John Doe'));
    expect(mockNavigate).toHaveBeenCalledWith('/users/user1');
    expect(mockFetch).toHaveBeenCalledWith('/api/search?q=John Doe');
  });
  
  it('debounces API calls', async () => {
    mockFetch.mockResolvedValue({ // General mock for this test
      ok: true,
      json: async () => [], 
    } as Response);

    render(<SearchBar />, { wrapper: TestWrapper });
    const input = screen.getByPlaceholderText('Search posts, entities, users...');

    await userEvent.type(input, 't');
    await userEvent.type(input, 'e');
    await userEvent.type(input, 's');
    // API should not have been called yet due to debouncing
    expect(mockFetch).not.toHaveBeenCalled();
    
    await userEvent.type(input, 't');
    
    // Wait for the debounce timeout (500ms) + a bit more
    await new Promise(resolve => setTimeout(resolve, 700)); 

    expect(mockFetch).toHaveBeenCalledTimes(1); 
    expect(mockFetch).toHaveBeenCalledWith('/api/search?q=test');

    // Type again after debounce
    mockFetch.mockClear(); // Clear previous calls for the next assertion
    await userEvent.type(input, 'a');
     await new Promise(resolve => setTimeout(resolve, 700));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/search?q=testa');
  });
});
