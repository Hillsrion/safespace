import type { AppError } from './types';

export function parseError(error: unknown): string {
  if (isAppError(error) && error.status >= 400 && error.status < 500) {
    return error.message;
  }
  return "An error occurred";
}

export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'status' in error &&
    'message' in error
  );
}

export function createError(
  message: string,
  code: string,
  status: number,
  details?: Record<string, unknown>
): AppError {
  const error = new Error(message) as AppError;
  error.code = code as AppError['code'];
  error.status = status;
  if (details) {
    error.details = details;
  }
  return error;
}
