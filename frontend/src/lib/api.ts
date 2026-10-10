// Thin fetch wrapper: cookies, CSRF header, JSON, and friendly errors.

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly fields?: Record<string, string>,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let unauthorizedHandler: (() => void) | null = null;
/** Called when any request (other than login) gets a 401 — e.g. session expired. */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

const FALLBACK: Record<number, string> = {
  400: 'Please check the information and try again.',
  403: 'You do not have permission to do that.',
  404: 'The requested item was not found.',
  409: 'This conflicts with existing data.',
  413: 'The file or request is too large.',
  429: 'Too many requests. Please wait a moment.',
};

type Query = Record<string, string | number | boolean | null | undefined>;

export function toQuery(params?: Query): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

interface RequestOptions {
  query?: Query;
  /** Status codes (besides 2xx) whose JSON body should be returned instead of thrown. */
  acceptStatus?: number[];
}

async function request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}${toQuery(opts.query)}`, { method, headers, body: payload, credentials: 'include' });
  } catch {
    throw new ApiError('Unable to reach the server. Please check your connection and try again.', 0, 'NETWORK');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);

  if (res.ok || opts.acceptStatus?.includes(res.status)) return data as T;

  if (res.status === 401 && !path.startsWith('/auth/login')) unauthorizedHandler?.();
  const err = data?.error ?? {};
  const { message, code, fields, ...details } = err;
  throw new ApiError(
    typeof message === 'string' && message ? message : (FALLBACK[res.status] ?? 'Something went wrong. Please try again.'),
    res.status,
    code,
    fields,
    details,
  );
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, { query }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, body ?? {}, opts),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Downloads a file from an authenticated endpoint. */
export async function downloadFile(path: string, query?: Query) {
  let res: Response;
  try {
    res = await fetch(`/api${path}${toQuery(query)}`, { credentials: 'include' });
  } catch {
    throw new ApiError('Unable to reach the server.', 0, 'NETWORK');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error?.message ?? 'The download failed. Please try again.', res.status);
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'download';
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** User-facing message for any thrown value. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}
