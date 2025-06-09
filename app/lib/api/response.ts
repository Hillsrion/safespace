/**
 * API Response Utility
 *
 * This module provides utilities for creating consistent API responses.
 * It includes type definitions and helper functions for success and error responses.
 */

/**
 * Represents an error API response
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: unknown;
}

/**
 * Creates an error response with the given error details
 *
 * @param error The error message
 * @param code The error code
 * @param status The HTTP status code
 * @param details Additional error details
 * @returns A Response object with the error response
 */
export function errorResponse(
  error: string,
  code: string,
  status: number = 500,
  details?: unknown
): Response {
  const errorResponse: ApiErrorResponse = details
    ? { success: false, error, code, details }
    : { success: false, error, code };

  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
