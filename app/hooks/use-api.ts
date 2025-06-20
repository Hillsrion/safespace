import { useState } from "react";
import type { AppError } from "~/lib/error/types";
import { handleError } from "~/lib/error/handle";

type ApiMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/**
 * Custom hook for making API calls with error handling and loading state management.
 *
 * @template T - The expected data type of the API response.
 *
 * @returns {Object} - Returns an object containing:
 *   - `callApi`: Function to trigger the API call.
 *   - `isLoading`: Boolean indicating the loading state of the API call.
 *   - `error`: The error object if the call fails, or null if no error.
 *   - `data`: The data returned from the API call, or null if none.
 *   - `reset`: Function to reset the error and data states.
 */
export function useApi<T = any>() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [data, setData] = useState<T | null>(null);

  const callApi = async (
    url: string,
    options: {
      method?: ApiMethod;
      body?: any;
      headers?: Record<string, string>;
      showErrorToast?: boolean;
    } = {}
  ): Promise<{ data: T | null; error: AppError | null }> => {
    const {
      method = "GET",
      body,
      headers = {},
      showErrorToast = true,
    } = options;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        credentials: "include",
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage =
          responseData.error ||
          `API request failed with status ${response.status}`;
        const errorCode =
          (responseData.code as AppError["code"]) || "server_error:api";

        const errorObj: AppError = {
          name: "ApiError",
          message: errorMessage,
          status: response.status,
          code: errorCode,
          details: responseData.details || {},
        };

        if (showErrorToast) {
          handleError(errorObj);
        }

        setError(errorObj);
        return { data: null, error: errorObj };
      }

      setData(responseData);
      return { data: responseData, error: null };
    } catch (error) {
      const errorObj: AppError = {
        name: "NetworkError",
        message: "Network error or failed to process response",
        status: 500,
        code: "network_error:api",
        details: { originalError: error },
      };

      if (showErrorToast) {
        handleError(errorObj);
      }

      setError(errorObj);
      return { data: null, error: errorObj };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    callApi,
    isLoading,
    error,
    data,
    reset: () => {
      setError(null);
      setData(null);
    },
  };
}
