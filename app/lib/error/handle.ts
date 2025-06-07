import { toast } from '~/hooks/use-toast';
import { parseError } from './parse';
import type { AppError } from './types';

type ErrorHandlerOptions = {
  defaultMessage?: string;
  showToast?: boolean;
};

export function handleError(
  error: unknown,
  options: ErrorHandlerOptions = {}
): string {
  const { defaultMessage = 'Something went wrong', showToast = true } = options;
  
  const message = parseError(error) || defaultMessage;
  
  if (showToast) {
    toast({
      title: 'Error',
      description: message,
      variant: 'destructive',
    });
  }

  // Log server errors or other important errors
  if (error && (error as AppError).status && (error as AppError).status >= 500) {
    console.error('Server Error:', error);
  }

  return message;
}

// Example usage:
// handleError(new Error('Network error'));
// handleError('Custom error message');
// handleError(someError, { defaultMessage: 'Failed to load data' });
