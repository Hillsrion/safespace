import type { ApiErrorResponse } from "./response";
import type { ErrorCode } from "~/lib/error/types";

/**
 * HTTP error handling utilities for the application
 * Uses error codes defined in ~/lib/error/types.ts
 */

/**
 * Custom error class for HTTP errors
 * Extends the native Error class with additional HTTP-specific properties
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: ErrorCode,
    public details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }

  /**
   * Converts the error to a Response object
   * @returns A Response object with the error details
   */
  toResponse(): Response {
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: this.message,
      code: this.code,
    };

    if (this.details !== undefined) {
      errorResponse.details = this.details;
    }

    return new Response(JSON.stringify(errorResponse), {
      status: this.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Throws an HTTP error with the given status, message, and code
 *
 * @param status HTTP status code
 * @param message Human-readable error message
 * @param code Application-specific error code
 * @param details Additional error details
 * @throws {HttpError}
 */
export function throwHttpError(
  status: number,
  message: string,
  code: ErrorCode,
  details?: unknown
): never {
  throw new HttpError(status, message, code, details);
}

/**
 * Collection of common HTTP error factories
 * Provides a consistent way to throw common HTTP errors
 */
export const errors = {
  badRequest: (
    message: string,
    code: ErrorCode = "bad_request:api",
    details?: unknown
  ) => {
    if (!code.startsWith("bad_request:")) {
      throw new Error(
        'Invalid error code for badRequest. Must start with "bad_request:"'
      );
    }
    return throwHttpError(400, message, code, details);
  },

  unauthorized: (
    message: string = "Unauthorized",
    code: ErrorCode = "unauthorized:auth"
  ) => throwHttpError(401, message, code),

  forbidden: (
    message: string = "Forbidden",
    code: ErrorCode = "forbidden:auth"
  ) => throwHttpError(403, message, code),

  notFound: (
    message: string = "Resource not found",
    code: ErrorCode = "not_found:api"
  ) => {
    if (!code.startsWith("not_found:")) {
      throw new Error(
        'Invalid error code for notFound. Must start with "not_found:"'
      );
    }
    return throwHttpError(404, message, code);
  },

  conflict: (
    message: string,
    code: ErrorCode = "bad_request:api",
    details?: unknown
  ) => {
    if (!code.startsWith("bad_request:")) {
      throw new Error(
        'Invalid error code for conflict. Must start with "bad_request:"'
      );
    }
    return throwHttpError(409, message, code, details);
  },

  internalServerError: (
    message: string = "Internal server error",
    code: ErrorCode = "server_error:api"
  ) => {
    if (!code.startsWith("server_error:")) {
      throw new Error(
        'Invalid error code for internalServerError. Must start with "server_error:"'
      );
    }
    return throwHttpError(500, message, code);
  },
};
