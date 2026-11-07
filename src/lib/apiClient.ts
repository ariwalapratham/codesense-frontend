/** Single HTTP client: env base URL + `{ error: { code, message, request_id, details } }` envelope. */

const DEV_FALLBACK = 'http://localhost:8000';

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'conflict'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'repo_too_large'
  | 'upstream_error'
  | 'internal_error'
  | string;

export class ApiError extends Error {
  readonly name = 'ApiError';

  constructor(
    message: string,
    readonly code: ApiErrorCode,
    readonly status: number,
    readonly requestId: string | null,
    readonly details: Record<string, unknown> | null,
    readonly retryAfter: number | null,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Resolve `VITE_API_BASE_URL` with no trailing slash. */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!raw) {
    if (import.meta.env.DEV) {
      return DEV_FALLBACK;
    }
    throw new Error('VITE_API_BASE_URL is required');
  }
  return raw.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) {
    return null;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.floor(seconds));
  }
  const millis = Date.parse(header);
  if (Number.isNaN(millis)) {
    return null;
  }
  return Math.max(0, Math.ceil((millis - Date.now()) / 1000));
}

/** Turn a failed Response into ApiError, preferring the documented envelope. */
export async function parseApiError(response: Response): Promise<ApiError> {
  const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
  const headerRequestId = response.headers.get('X-Request-ID');

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (isRecord(body) && isRecord(body.error)) {
    const err = body.error;
    const code =
      typeof err.code === 'string' && err.code ? err.code : 'internal_error';
    const message =
      typeof err.message === 'string' && err.message
        ? err.message
        : response.statusText || 'Request failed';
    const requestId =
      typeof err.request_id === 'string' && err.request_id
        ? err.request_id
        : headerRequestId;
    const details = isRecord(err.details) ? err.details : null;
    return new ApiError(message, code, response.status, requestId, details, retryAfter);
  }

  return new ApiError(
    response.statusText || 'Request failed',
    'internal_error',
    response.status,
    headerRequestId,
    null,
    retryAfter,
  );
}

function mergeHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (!headers.has('X-Request-ID')) {
    headers.set('X-Request-ID', crypto.randomUUID());
  }
  return headers;
}

/** JSON fetch against the API base URL. Throws ApiError on non-2xx. */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = mergeHeaders(init.headers);
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${getApiBaseUrl()}${normalizedPath}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}
