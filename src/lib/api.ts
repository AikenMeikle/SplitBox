/**
 * Typed HTTP client helper for communicating with the Divly Express API (`/api/*`).
 *
 * How authentication works for a 1st-year CS student:
 * 1. When a student verifies their 6-digit OTP (or an admin enters their PIN),
 *    the backend returns a random session `token`.
 * 2. We store that token in `localStorage['divly_auth_token']`.
 * 3. Every `apiFetch()` call automatically attaches `Authorization: Bearer <token>`
 *    so the server knows which student or admin is making the request.
 */

const AUTH_TOKEN_KEY = 'divly_auth_token';

/** Custom error class carrying the HTTP status code alongside a readable message. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Read the saved session token from localStorage (returns null if signed out). */
export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Save or clear the session token in localStorage. */
export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // Ignore storage quota / private-browsing errors gracefully
  }
}

const AUTH_LOGIN_PATHS = [
  '/api/auth/request-otp',
  '/api/auth/verify-otp',
  '/api/auth/admin-login',
  '/api/auth/dev-login',
];

/**
 * Typed wrapper around `fetch()` that:
 * - Attaches `Authorization: Bearer <token>` automatically when signed in
 * - Sends and parses JSON cleanly
 * - Converts non-2xx responses into readable `Error(message)` instances
 * - Handles expired/revoked `401 Unauthorized` tokens gracefully
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  // Automatically set JSON Content-Type whenever a string/JSON body is sent
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const rawText = await response.text();
  let parsed: unknown = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    // If a protected endpoint returns 401, clear stale token and notify AppContext
    const isLoginAttempt = AUTH_LOGIN_PATHS.some((loginPath) => path.startsWith(loginPath));
    if (response.status === 401 && token && !isLoginAttempt) {
      setAuthToken(null);
      window.dispatchEvent(new CustomEvent('divly:unauthorized'));
    }

    const payload = parsed as { error?: string; message?: string } | null;
    const message =
      payload?.error ||
      payload?.message ||
      `Request failed (${response.status} ${response.statusText || 'Error'})`;

    throw new ApiError(message, response.status);
  }

  return (parsed ?? ({} as T)) as T;
}
