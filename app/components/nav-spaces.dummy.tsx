import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavSpaces } from './nav-spaces'; // Adjust path if needed
import { Sidebar } from '~/components/ui/sidebar'; // Using Sidebar as a potential provider

// Mock useSidebar
vi.mock("~/components/ui/sidebar", async (importOriginal) => {
  const original = await importOriginal() as any; // Cast to any to allow adding useSidebar
  return {
    ...original,
    useSidebar: () => ({ isMobile: false }),
    // If SidebarProvider is a specific component, mock it or use the actual one if simple
    // For now, we'll wrap with the actual Sidebar component if it provides context
  };
});

// Mock Lucide icons to prevent rendering issues in tests if they are complex
vi.mock("lucide-react", async (importOriginal) => {
  const original = await importOriginal() as any;
  return {
    ...original,
    ChevronDownIcon: () => <div data-testid="chevron-down-icon" />,
    ChevronUpIcon: () => <div data-testid="chevron-up-icon" />,
    FolderIcon: () => <div data-testid="folder-icon" />,
    MoreHorizontalIcon: () => <div data-testid="more-horizontal-icon" />,
    Trash2Icon: () => <div data-testid="trash-icon" />,
    UsersIcon: () => <div data-testid="users-icon" />,
  };
});


const mockFetch = vi.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ success: true }),
    ok: true,
  })
);
global.fetch = mockFetch;

const mockSpaceItems = [
  { name: "Space Alpha", url: "/dashboard/spaces/space_alpha_id", icon: undefined },
  { name: "Space Beta", url: "/dashboard/spaces/space_beta_id", icon: undefined },
];

// Wrapper component if context is needed
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Assuming Sidebar component itself might provide context needed by its children
  // If SidebarProvider exists and is the correct context provider, use that.
  // For this example, we'll try wrapping with Sidebar if it's a simple provider.
  // If this causes issues, it means a more specific SidebarProvider or a different setup is needed.
  return <Sidebar>{children}</Sidebar>; 
};


describe('NavSpaces - Leave Space Interaction', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    // vi.clearAllMocks() might be too broad if some mocks should persist (like useSidebar)
    // but for fetch it's good.
  });

  it('renders "Quitter l\'espace" button and opens dialog on click', async () => {
    render(
        <NavSpaces items={mockSpaceItems} />
      , { wrapper: TestWrapper }
    );

    // Find all "Options" buttons (MoreHorizontalIcon triggers)
    const spaceItemOptionsTriggers = screen.getAllByRole('button', { name: /Options/i });
    expect(spaceItemOptionsTriggers.length).toBeGreaterThan(0);
    fireEvent.click(spaceItemOptionsTriggers[0]); // Click the first one

    // Wait for dropdown to appear and find "Quitter l'espace"
    const leaveButton = await screen.findByText("Quitter l'espace");
    expect(leaveButton).toBeInTheDocument();
    
    fireEvent.click(leaveButton);

    // Check if dialog opens by looking for its title or description
    // The dialog's title is also "Quitter l'espace", so we need to be specific
    // Or look for the description which is unique to the dialog
    expect(await screen.findByText("Êtes-vous sûr de vouloir quitter cet espace ?")).toBeInTheDocument();
  });

  it('calls fetch with correct URL when leave is confirmed', async () => {
    render(
        <NavSpaces items={mockSpaceItems} />
      , { wrapper: TestWrapper }
    );

    const spaceItemOptionsTriggers = screen.getAllByRole('button', { name: /Options/i });
    fireEvent.click(spaceItemOptionsTriggers[0]);
    
    const leaveMenuItem = await screen.findByText("Quitter l'espace");
    fireEvent.click(leaveMenuItem);

    // Dialog should be open, find the confirm button within the dialog context
    // The dialog title "Quitter l'espace" is also the menu item text.
    // We need to ensure we are clicking the button in the dialog.
    // The dialog content has "Êtes-vous sûr de vouloir quitter cet espace ?"
    const dialog = await screen.findByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: /Quitter/i });
    
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/spaces/space_alpha_id/leave', // Derived from mockSpaceItems[0].url
        expect.objectContaining({ method: 'POST' })
      );
    });

    // Also check if the dialog closes after confirmation
    expect(screen.queryByText("Êtes-vous sûr de vouloir quitter cet espace ?")).not.toBeInTheDocument();
  });
});
