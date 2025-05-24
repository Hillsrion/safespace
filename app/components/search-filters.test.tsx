import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchFilters } from '~/components/search-filters';
import type { Space } from '~/lib/types';
import { PostSeverity } from '@prisma/client'; // Import PostSeverity
import { useSearchFilters } from '~/hooks/useSearchFilters';

// Mock the useSearchFilters hook
jest.mock('~/hooks/useSearchFilters');

const mockSetSearchTerm = jest.fn();
const mockSetSeverity = jest.fn();
const mockSetSelectedSpaceIds = jest.fn();
const mockSetMyPostsOnly = jest.fn();
const mockSetAdminOnly = jest.fn();
const mockSetSortOptions = jest.fn();

const mockUseSearchFilters = useSearchFilters as jest.Mock;

const availableSpaces: Space[] = [
  { id: 'space1', name: 'Space Alpha' },
  { id: 'space2', name: 'Space Beta' },
];
// Updated availableSeverities to use PostSeverity
const availableSeverities: PostSeverity[] = [PostSeverity.High, PostSeverity.Medium, PostSeverity.Low];

const defaultHookValues = {
  searchTerm: '',
  setSearchTerm: mockSetSearchTerm,
  severity: null as PostSeverity | null, // Ensure type aligns
  setSeverity: mockSetSeverity,
  selectedSpaceIds: [],
  setSelectedSpaceIds: mockSetSelectedSpaceIds,
  myPostsOnly: false,
  setMyPostsOnly: mockSetMyPostsOnly,
  adminOnly: false,
  setAdminOnly: mockSetAdminOnly,
  sortOptions: { orderBy: 'date', orderDirection: 'desc', groupBySpace: false },
  setSortOptions: mockSetSortOptions,
  results: [], // results and loading are not used by SearchFilters UI directly
  loading: false,
};

describe('SearchFilters Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSearchFilters.mockReturnValue(defaultHookValues);
  });

  it('renders all filter controls with new Input placeholder', () => {
    render(
      <SearchFilters
        availableSpaces={availableSpaces}
        userRoles={['user']}
        availableSeverities={availableSeverities}
      />
    );

    // Test for new Input field (previously CommandInput)
    expect(screen.getByPlaceholderText('Search dashboard items...')).toBeInTheDocument();
    
    // Other controls
    expect(screen.getByText('Filter by severity...')).toBeInTheDocument();
    expect(screen.getByText('Select spaces...')).toBeInTheDocument();
    expect(screen.getByLabelText('My Posts Only')).toBeInTheDocument();
    expect(screen.getByText('Sort by')).toBeInTheDocument();
  });

  it('calls setSearchTerm when typing in the new Input field', async () => {
    const user = userEvent.setup();
    render(
      <SearchFilters
        availableSpaces={availableSpaces}
        userRoles={['user']}
        availableSeverities={availableSeverities}
      />
    );
    const searchInput = screen.getByPlaceholderText('Search dashboard items...');
    await user.type(searchInput, 'test search');
    // The Input component's onChange provides e.target.value
    expect(mockSetSearchTerm).toHaveBeenCalledWith('test search');
  });

  it('calls setSeverity with PostSeverity value when changing severity select', async () => {
    const user = userEvent.setup();
    render(
      <SearchFilters
        availableSpaces={availableSpaces}
        userRoles={['user']}
        availableSeverities={availableSeverities}
      />
    );
    
    const severitySelectTrigger = screen.getByText('Filter by severity...');
    await user.click(severitySelectTrigger);

    // Click an option (e.g., 'High')
    // The text in the dropdown should match the PostSeverity enum value
    const optionHigh = await screen.findByText(PostSeverity.High); 
    await user.click(optionHigh);

    expect(mockSetSeverity).toHaveBeenCalledWith(PostSeverity.High);
  });

  it('calls setSelectedSpaceIds when interacting with MultiSelect', async () => {
    const user = userEvent.setup();
    render(
      <SearchFilters
        availableSpaces={availableSpaces}
        userRoles={['user']}
        availableSeverities={availableSeverities}
      />
    );

    const multiSelectPlaceholder = screen.getByText('Select spaces...');
    await user.click(multiSelectPlaceholder); 
    
    const spaceAlphaOption = await screen.findByText(availableSpaces[0].name, { selector: '[role="option"] *' });
    await user.click(spaceAlphaOption);
    
    expect(mockSetSelectedSpaceIds).toHaveBeenCalledWith([availableSpaces[0].id]);
  });


  it('calls setMyPostsOnly when "My posts only" checkbox is clicked', async () => {
    const user = userEvent.setup();
    render(
      <SearchFilters
        availableSpaces={availableSpaces}
        userRoles={['user']}
        availableSeverities={availableSeverities}
      />
    );
    const myPostsCheckbox = screen.getByLabelText('My Posts Only');
    await user.click(myPostsCheckbox);
    expect(mockSetMyPostsOnly).toHaveBeenCalledWith(true);
  });

  describe('Admin only checkbox', () => {
    it('is not rendered if user does not have admin/superadmin role', () => {
      render(
        <SearchFilters
          availableSpaces={availableSpaces}
          userRoles={['user']}
          availableSeverities={availableSeverities}
        />
      );
      expect(screen.queryByLabelText('Admin Only')).not.toBeInTheDocument();
    });

    it('is rendered if user has "admin" role', () => {
      render(
        <SearchFilters
          availableSpaces={availableSpaces}
          userRoles={['admin']}
          availableSeverities={availableSeverities}
        />
      );
      expect(screen.getByLabelText('Admin Only')).toBeInTheDocument();
    });
    
    it('is rendered if user has "superadmin" role', () => {
        render(
          <SearchFilters
            availableSpaces={availableSpaces}
            userRoles={['superadmin']}
            availableSeverities={availableSeverities}
          />
        );
        expect(screen.getByLabelText('Admin Only')).toBeInTheDocument();
      });

    it('calls setAdminOnly when "Admin only" checkbox is clicked', async () => {
      const user = userEvent.setup();
      render(
        <SearchFilters
          availableSpaces={availableSpaces}
          userRoles={['admin']}
          availableSeverities={availableSeverities}
        />
      );
      const adminOnlyCheckbox = screen.getByLabelText('Admin Only');
      await user.click(adminOnlyCheckbox);
      expect(mockSetAdminOnly).toHaveBeenCalledWith(true);
    });
  });

  it('calls setSortOptions when sort dropdown options are clicked', async () => {
    const user = userEvent.setup();
    // Ensure the initial state for sortOptions in the mock is clearly defined for this test
    const initialSortOptions = { orderBy: 'date', orderDirection: 'desc', groupBySpace: false };
    mockUseSearchFilters.mockReturnValue({
      ...defaultHookValues,
      sortOptions: initialSortOptions, 
    });

    render(
      <SearchFilters
        availableSpaces={availableSpaces}
        userRoles={['user']}
        availableSeverities={availableSeverities}
      />
    );
    const sortButton = screen.getByText('Sort by'); // Usually button has text or aria-label
    await user.click(sortButton);

    const groupBySpaceOption = await screen.findByText('Group by Space');
    await user.click(groupBySpaceOption);
    
    // Check if the setter was called with a function
    expect(mockSetSortOptions).toHaveBeenCalledWith(expect.any(Function));
    // Simulate the state update to verify the new state
    const firstSetSortOptionsFn = mockSetSortOptions.mock.calls[0][0];
    const firstNewSortState = firstSetSortOptionsFn(initialSortOptions);
    expect(firstNewSortState.groupBySpace).toBe(true);

    // Test "Order Ascending"
    await user.click(sortButton); // Close dropdown
    await user.click(sortButton); // Re-open dropdown
    
    const orderAscendingOption = await screen.findByText('Order Ascending');
    await user.click(orderAscendingOption);
    expect(mockSetSortOptions).toHaveBeenCalledTimes(2);
    const secondSetSortOptionsFn = mockSetSortOptions.mock.calls[1][0];
    // Pass the state that would result from the first click
    const secondNewSortState = secondSetSortOptionsFn(firstNewSortState); 
    expect(secondNewSortState.orderDirection).toBe('asc');

    // Test toggling "Order Ascending" back
    await user.click(sortButton); 
    await user.click(sortButton); 
    await user.click(orderAscendingOption); // Click again to uncheck
    expect(mockSetSortOptions).toHaveBeenCalledTimes(3);
    const thirdSetSortOptionsFn = mockSetSortOptions.mock.calls[2][0];
    const thirdNewSortState = thirdSetSortOptionsFn(secondNewSortState);
    expect(thirdNewSortState.orderDirection).toBe('desc');
  });
});
