import { isAxiosError } from 'axios';
import type { AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '../types/index.types';
import { guestApi, authApi } from '../lib/utils/axiosInstance';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** HTTP methods valid for mutations — excludes GET which is read-only and belongs in `useApiQuery`. */
export type MutationMethod = 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Axios request config extended with `isGuestApi` — when `true` the request is sent
 * via `guestApi` (no Authorization header, no token-refresh). Omit or set `false` for
 * protected endpoints that require a valid session.
 */
export type ApiRequestConfig = AxiosRequestConfig & { isGuestApi?: boolean };

/**
 * Typed error class wrapping a failed API response.
 * Thrown by `apiClient` whenever `response.success` is false.
 */
export class ApiError extends Error {
  response: ApiResponse<unknown>;
  status: number | undefined;

  /**
   * @param response - The full API response body from the server
   * @param status - The HTTP status code of the failed response
   */
  constructor(response: ApiResponse<unknown>, status?: number) {
    super(response.message ?? response.error?.message ?? 'API request failed');
    this.name = 'ApiError';
    this.response = response;
    this.status = status;
  }
}

/**
 * Generic base HTTP client — routes to `guestApi` or `authApi` based on `isGuestApi`,
 * then throws `ApiError` when `success` is false.
 * All method-specific helpers (`apiGet`, `apiPost`, etc.) delegate to this function.
 * @param method - HTTP verb to use for the request
 * @param url - Relative endpoint path (resolved against `VITE_API_BASE_URL`)
 * @param config - Optional config; set `isGuestApi: true` to skip auth headers
 * @returns The full typed `ApiResponse<TResponse>` on success
 * @throws `ApiError` when the server returns `success: false`
 */
export async function apiClient<TResponse>(
  method: HttpMethod,
  url: string,
  config?: ApiRequestConfig,
): Promise<ApiResponse<TResponse>> {
  const { isGuestApi, ...axiosConfig } = config ?? {};
  const instance = isGuestApi ? guestApi : authApi;

  const response = await instance.request<ApiResponse<TResponse>>({
    method,
    url,
    ...axiosConfig,
  });

  if (response.data.success === false) {
    throw new ApiError(response.data as ApiResponse<unknown>, response.status);
  }

  return response.data;
}

/**
 * Sends a GET request to the given endpoint.
 * @param endpoint - Relative API path
 * @param config - Optional config; set `isGuestApi: true` for public endpoints
 * @returns Typed `ApiResponse<TResponse>` from the server
 */
export async function apiGet<TResponse>(
  endpoint: string,
  config?: ApiRequestConfig,
): Promise<ApiResponse<TResponse>> {
  return apiClient<TResponse>('GET', endpoint, config);
}

/**
 * Sends a POST request with a JSON payload to the given endpoint.
 * @param endpoint - Relative API path
 * @param payload - Request body to be JSON-serialized (and encrypted if enabled)
 * @param config - Optional config; set `isGuestApi: true` for public endpoints
 * @returns Typed `ApiResponse<TResponse>` from the server
 */
export async function apiPost<TResponse, TPayload>(
  endpoint: string,
  payload: TPayload,
  config: ApiRequestConfig = {},
): Promise<ApiResponse<TResponse>> {
  return apiClient<TResponse>('POST', endpoint, { ...config, data: payload });
}

/**
 * Sends a PUT request with a JSON payload to the given endpoint.
 * @param endpoint - Relative API path
 * @param payload - Request body to be JSON-serialized (and encrypted if enabled)
 * @param config - Optional config; set `isGuestApi: true` for public endpoints
 * @returns Typed `ApiResponse<TResponse>` from the server
 */
export async function apiPut<TResponse, TPayload>(
  endpoint: string,
  payload: TPayload,
  config: ApiRequestConfig = {},
): Promise<ApiResponse<TResponse>> {
  return apiClient<TResponse>('PUT', endpoint, { ...config, data: payload });
}

/**
 * Sends a DELETE request to the given endpoint.
 * @param endpoint - Relative API path
 * @param config - Optional config; set `isGuestApi: true` for public endpoints
 * @returns Typed `ApiResponse<TResponse>` from the server
 */
export async function apiDelete<TResponse>(
  endpoint: string,
  config?: ApiRequestConfig,
): Promise<ApiResponse<TResponse>> {
  return apiClient<TResponse>('DELETE', endpoint, config);
}

/**
 * Sends a PATCH request with a partial JSON payload to the given endpoint.
 * @param endpoint - Relative API path
 * @param payload - Partial update payload to be JSON-serialized
 * @param config - Optional config; set `isGuestApi: true` for public endpoints
 * @returns Typed `ApiResponse<TResponse>` from the server
 */
export async function apiPatch<TResponse, TPayload>(
  endpoint: string,
  payload: TPayload,
  config: ApiRequestConfig = {},
): Promise<ApiResponse<TResponse>> {
  return apiClient<TResponse>('PATCH', endpoint, { ...config, data: payload });
}

const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Extracts a human-readable error message from any thrown value.
 * Handles `ApiError`, `AxiosError` (with or without a response body), and plain `Error`.
 * Falls back to a generic message for all other values.
 * @param error - The caught value (typed as `unknown` to cover all throw sites)
 * @returns A display-safe error string suitable for showing in a toast or UI alert
 */
export const extractErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.response.message ?? error.response.error?.message ?? DEFAULT_ERROR_MESSAGE;
  }
  if (isAxiosError(error)) {
    if (error.response?.data) {
      const data = error.response.data as Partial<ApiResponse<unknown>>;
      return data.message ?? data.error?.message ?? DEFAULT_ERROR_MESSAGE;
    }
    // Network error (no response — timeout, DNS failure, etc.)
    return DEFAULT_ERROR_MESSAGE;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return DEFAULT_ERROR_MESSAGE;
};
