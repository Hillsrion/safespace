import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaveSpaceDialog } from './LeaveSpaceDialog'; // Assuming the component is in the same directory

describe('LeaveSpaceDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();

  // Reset mocks before each test
  beforeEach(() => {
    mockOnClose.mockClear();
    mockOnConfirm.mockClear();
  });

  it('renders correctly when open', () => {
    render(<LeaveSpaceDialog isOpen={true} onClose={mockOnClose} onConfirm={mockOnConfirm} />);

    expect(screen.getByText("Quitter l'espace")).toBeInTheDocument();
    expect(screen.getByText("Êtes-vous sûr de vouloir quitter cet espace ?")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Annuler" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Quitter" })).toBeInTheDocument();
  });

  it('calls onClose when "Annuler" button is clicked', () => {
    render(<LeaveSpaceDialog isOpen={true} onClose={mockOnClose} onConfirm={mockOnConfirm} />);
    
    const cancelButton = screen.getByRole('button', { name: "Annuler" });
    fireEvent.click(cancelButton);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm and onClose when "Quitter" button is clicked', () => {
    render(<LeaveSpaceDialog isOpen={true} onClose={mockOnClose} onConfirm={mockOnConfirm} />);
    
    const confirmButton = screen.getByRole('button', { name: "Quitter" });
    fireEvent.click(confirmButton);
    
    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
    expect(mockOnClose).toHaveBeenCalledTimes(1); // As per current implementation
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<LeaveSpaceDialog isOpen={false} onClose={mockOnClose} onConfirm={mockOnConfirm} />);
    
    // When isOpen is false, the component returns null, so its direct children shouldn't be in the document.
    // We check if the container's first child is null, or if specific elements are not present.
    expect(container.firstChild).toBeNull(); 
    // Alternative checks:
    expect(screen.queryByText("Quitter l'espace")).not.toBeInTheDocument();
    expect(screen.queryByText("Êtes-vous sûr de vouloir quitter cet espace ?")).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Annuler" })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Quitter" })).not.toBeInTheDocument();
  });
});
