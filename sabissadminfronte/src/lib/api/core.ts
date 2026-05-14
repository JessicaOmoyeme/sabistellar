const DEFAULT_API_BASE_URL = "http://localhost:8080";

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean | null | undefined>;

type ApiHttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface ApiRequestOptions<TBody = unknown> {
  method?: ApiHttpMethod;
  path: string;
  body?: TBody;
  formData?: FormData;
  headers?: HeadersInit;
  token?: string | null;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
}

type ErrorPayload = {
  error?: string;
  message?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly payload: unknown;

  constructor(status: number, statusText: string, payload: unknown) {
    const message =
      (isErrorPayload(payload) && (payload.error ?? payload.message)) ||
      `${status} ${statusText}`.trim();

    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.payload = payload;
  }
}

export function getApiBaseUrl() {
  const configured = import.meta.env?.VITE_API_BASE_URL?.trim();
  const baseUrl = configured && configured.length > 0 ? configured : DEFAULT_API_BASE_URL;

  return baseUrl.replace(/\/+$/, "");
}

export async function apiRequest<TResponse, TBody = unknown>({
  method = "GET",
  path,
  body,
  formData,
  headers,
  token,
  query,
  signal,
}: ApiRequestOptions<TBody>): Promise<TResponse> {
  const requestHeaders = new Headers(headers);

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let requestBody: BodyInit | undefined;

  if (formData) {
    requestBody = formData;
  } else if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(buildRequestUrl(path, query), {
    method,
    headers: requestHeaders,
    body: requestBody,
    credentials: "include",
    signal,
  });

  const payload = await parseResponseBody(response);

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText, payload);
  }

  return payload as TResponse;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Request failed.";
}

function buildRequestUrl(path: string, query?: Record<string, QueryValue>) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const search = buildQueryString(query);

  return `${getApiBaseUrl()}${normalizedPath}${search}`;
}

function buildQueryString(query?: Record<string, QueryValue>) {
  if (!query) {
    return "";
  }

  const searchParams = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(query)) {
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        appendQueryValue(searchParams, key, item);
      }

      continue;
    }

    appendQueryValue(searchParams, key, rawValue);
  }

  const serialized = searchParams.toString();

  return serialized ? `?${serialized}` : "";
}

function appendQueryValue(
  searchParams: URLSearchParams,
  key: string,
  value: string | number | boolean | null | undefined,
) {
  if (value === null || value === undefined) {
    return;
  }

  searchParams.append(key, String(value));
}

async function parseResponseBody(response: Response) {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  return text.length > 0 ? text : undefined;
}

function isErrorPayload(payload: unknown): payload is ErrorPayload {
  return typeof payload === "object" && payload !== null;
}
