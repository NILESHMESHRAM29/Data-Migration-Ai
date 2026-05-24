import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { VITE_API_BASE_URL, VITE_ENABLE_API_ENCRYPTION, VITE_ENABLE_API_DECRYPTION } from '../config/env';
import { getToken, setToken, clearAll } from '../utils/storage';
import { encryptPayload, decryptPayload } from '../utils/crypto';
import { queryClient } from '../utils/queryClient';
import { ROUTES } from '../constants/routes';
import { API_ENDPOINTS } from '../constants/endpoints';

/** Axios config extended with a `_retry` flag to prevent infinite 401 loops. */
type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

/** Pending resolve/reject pair for a request queued while a refresh is in-flight. */
type QueueItem = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};

/** Shared base config — single source of truth for baseURL, timeout, and Content-Type. */
const BASE_CONFIG = {
  baseURL: VITE_API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
};

/** True while a refresh request is in-flight — prevents concurrent refresh calls. */
let isRefreshing = false;

/** Requests that arrived with 401 while refresh was in-flight — replayed after refresh succeeds. */
let failedQueue: QueueItem[] = [];

/**
 * Drains the failed-request queue after a refresh attempt completes.
 * Resolves every queued item with the new token on success, rejects all on failure.
 * @param error - The refresh error, or `null` on success
 * @param token - The new JWT on success, or `null` on failure
 */
const processQueue = (error: unknown, token: string | null): void => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token !== null) {
      resolve(token);
    } else {
      reject(error);
    }
  });
  failedQueue = [];
};

/**
 * Authenticated Axios instance — attaches JWT on every request and silently
 * refreshes the token on a 401 before retrying. Use for all protected endpoints.
 * All API calls must go through this instance (via `apiClient.ts`) — never import axios directly.
 */
const authInstance: AxiosInstance = axios.create(BASE_CONFIG);

/**
 * Unauthenticated Axios instance — sends plain requests with no Authorization header
 * and no token-refresh logic. Encryption/decryption interceptors are applied so payloads
 * match the backend format even on public endpoints. Use for login, refresh, and other
 * unauthenticated calls.
 */
export const guestApi: AxiosInstance = axios.create(BASE_CONFIG);

guestApi.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (VITE_ENABLE_API_ENCRYPTION && config.data != null) {
    config.data = { data: await encryptPayload(config.data) };
  }
  return config;
});

guestApi.interceptors.response.use(async (response: AxiosResponse) => {
  if (VITE_ENABLE_API_DECRYPTION && typeof response.data?.data === 'string') {
    response.data.data = await decryptPayload(response.data.data);
  }
  return response;
});

/**
 * Calls `/login/refresh` via `guestApi` (no auth interceptors) to avoid triggering
 * another 401 intercept loop. Decryption is handled by `guestApi`'s response interceptor.
 * @param expiredToken - The current (expired) JWT to send as Bearer
 * @returns The new JWT string from `data.token`
 * @throws When the refresh request fails or the response contains no token
 */
const callRefresh = async (expiredToken: string): Promise<string> => {
  const response = await guestApi.get<{ data: { token: string } }>(
    API_ENDPOINTS.REFRESH_TOKEN,
    { headers: { Authorization: `Bearer ${expiredToken}`, Accept: 'application/json' } },
  );

  const newToken = response.data.data?.token;
  if (!newToken) throw new Error('Refresh response missing token');
  return newToken;
};

authInstance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (VITE_ENABLE_API_ENCRYPTION && config.data != null) {
    config.data = { data: await encryptPayload(config.data) };
  }
  return config;
});

authInstance.interceptors.response.use(
  async (response: AxiosResponse) => {
    if (VITE_ENABLE_API_DECRYPTION && typeof response.data?.data === 'string') {
      response.data.data = await decryptPayload(response.data.data);
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig | undefined;

    if (!originalRequest || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return authInstance(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const expiredToken = await getToken();
      if (!expiredToken) throw new Error('No token available for refresh');
      const newToken = await callRefresh(expiredToken);
      await setToken(newToken);
      processQueue(null, newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return authInstance(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      clearAll();
      queryClient.clear();
      window.location.href = ROUTES.LOGIN;
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

/** Authenticated Axios instance — JWT attachment + silent token refresh on 401. */
export const authApi: AxiosInstance = authInstance;
