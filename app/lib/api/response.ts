import type { AppError } from "~/lib/error/types";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: AppError["code"];
}

export function createApiResponse<T = unknown>(
  success: boolean,
  options: {
    data?: T;
    error?: string;
    code?: AppError["code"];
  } = {}
): ApiResponse<T> {
  return {
    success,
    ...(options.data !== undefined && { data: options.data }),
    ...(options.error && { error: options.error }),
    ...(options.code && { code: options.code }),
  };
}

export function successResponse<T = unknown>(data: T): ApiResponse<T> {
  return createApiResponse<T>(true, { data });
}

export function errorResponse(
  message: string,
  code: AppError["code"] = "server_error:api",
  status: number = 500
): Response {
  return new Response(
    JSON.stringify(createApiResponse(false, { error: message, code })),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}
