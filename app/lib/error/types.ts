export type ErrorType =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limit"
  | "offline"
  | "server_error"
  | "validation_error";

export type Surface =
  | "chat"
  | "auth"
  | "api"
  | "posts"
  | "spaces"
  | "users"
  | "form";

export type ErrorCode = `${ErrorType}:${Surface}`;

export interface AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: Record<string, unknown>;
}

export type ErrorHandler = (error: unknown) => string;
