import { basename } from "node:path";
import { readFile } from "node:fs/promises";

import { endpointCatalogByName, type EndpointCatalogEntry } from "./catalog.js";

export type JsonObject = Record<string, unknown>;
export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean | null | undefined>;

export type ResponseFormat = "auto" | "json" | "text" | "base64";
export type BodyMode = "json" | "form" | "multipart" | "raw";

export interface FilePart {
  fieldName: string;
  path: string;
  filename?: string;
  contentType?: string;
}

export interface ThinkingDataRequest {
  endpointName?: string;
  method?: string;
  path?: string;
  baseUrl?: string;
  token?: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  form?: Record<string, QueryValue>;
  files?: FilePart[];
  bodyMode?: BodyMode;
  contentType?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  responseFormat?: ResponseFormat;
  maxBytes?: number;
}

export interface ThinkingDataResponse {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  method: string;
  endpoint?: EndpointCatalogEntry;
  headers: Record<string, string>;
  data?: unknown;
  text?: string;
  base64?: string;
  byteLength: number;
  truncated: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export function resolveBaseUrl(baseUrl?: string) {
  const resolved = baseUrl ?? process.env.THINKINGDATA_BASE_URL;
  if (!resolved?.trim()) {
    throw new Error(
      "Missing ThinkingData base URL. Pass baseUrl or set THINKINGDATA_BASE_URL, for example http://ta2:8992.",
    );
  }

  const trimmed = resolved.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(
      `Invalid ThinkingData base URL "${trimmed}". Include http:// or https://.`,
    );
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function resolveToken(
  token?: string,
  query?: Record<string, QueryValue>,
  requireToken = true,
) {
  const queryToken = query?.token;
  if (typeof queryToken === "string" && queryToken.length > 0) {
    return queryToken;
  }

  const resolved =
    token ??
    process.env.THINKINGDATA_API_SECRET ??
    process.env.THINKINGDATA_TOKEN;
  if (!resolved?.trim() && requireToken) {
    throw new Error(
      "Missing ThinkingData API secret. Pass token or set THINKINGDATA_API_SECRET.",
    );
  }

  return resolved?.trim();
}

export function redactToken(value: string) {
  return value.replace(/([?&]token=)[^&]+/gi, "$1***");
}

export function buildUrl(request: ThinkingDataRequest, endpoint?: EndpointCatalogEntry) {
  const rawPath = request.path ?? endpoint?.path;
  if (!rawPath?.trim()) {
    throw new Error("Missing path. Pass path or endpointName.");
  }

  const url = /^https?:\/\//i.test(rawPath)
    ? new URL(rawPath)
    : new URL(rawPath.replace(/^\/+/, ""), resolveBaseUrl(request.baseUrl));

  const token = resolveToken(
    request.token,
    request.query,
    !url.searchParams.has("token"),
  );
  if (token && !url.searchParams.has("token")) {
    url.searchParams.set("token", token);
  }

  appendQuery(url, request.query);
  return url;
}

export async function callThinkingData(
  request: ThinkingDataRequest,
): Promise<ThinkingDataResponse> {
  const endpoint = request.endpointName
    ? endpointCatalogByName.get(request.endpointName)
    : undefined;

  if (request.endpointName && !endpoint) {
    throw new Error(`Unknown endpointName "${request.endpointName}".`);
  }

  const method = (
    request.method ??
    endpoint?.method ??
    inferMethod(request)
  ).toUpperCase();
  const url = buildUrl(request, endpoint);
  const timeoutMs =
    request.timeoutMs ??
    numberFromEnv("THINKINGDATA_DEFAULT_TIMEOUT_MS") ??
    DEFAULT_TIMEOUT_MS;
  const maxBytes = request.maxBytes ?? DEFAULT_MAX_BYTES;
  const headers = new Headers(request.headers);
  const bodyMode = request.bodyMode ?? inferBodyMode(request, endpoint);
  const body = await buildRequestBody(request, bodyMode, headers, endpoint);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : body,
      signal: controller.signal,
    });

    return await readThinkingDataResponse({
      response,
      url,
      method,
      endpoint,
      responseFormat: request.responseFormat ?? "auto",
      maxBytes,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function appendQuery(url: URL, query?: Record<string, QueryValue>) {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (key === "token") {
      continue;
    }
    appendQueryValue(url, key, value);
  }
}

function appendQueryValue(url: URL, key: string, value: QueryValue) {
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(url, key, item);
    }
    return;
  }

  if (value === undefined || value === null) {
    return;
  }

  url.searchParams.append(key, String(value));
}

function inferMethod(request: ThinkingDataRequest) {
  if (request.body !== undefined || request.form || request.files?.length) {
    return "POST";
  }

  return "GET";
}

function inferBodyMode(
  request: ThinkingDataRequest,
  endpoint?: EndpointCatalogEntry,
): BodyMode {
  if (request.files?.length) {
    return "multipart";
  }

  if (request.form) {
    return "form";
  }

  const contentType = request.contentType ?? endpoint?.contentType;
  if (contentType?.includes("x-www-form-urlencoded")) {
    return "form";
  }

  if (typeof request.body === "string") {
    return "raw";
  }

  return "json";
}

async function buildRequestBody(
  request: ThinkingDataRequest,
  bodyMode: BodyMode,
  headers: Headers,
  endpoint?: EndpointCatalogEntry,
) {
  const contentType = request.contentType ?? endpoint?.contentType;

  if (bodyMode === "multipart") {
    const formData = new FormData();
    appendFormFields(formData, request.form);

    for (const file of request.files ?? []) {
      const bytes = await readFile(file.path);
      const filename = file.filename ?? basename(file.path);
      const blob = new Blob([bytes], {
        type: file.contentType ?? "application/octet-stream",
      });
      formData.append(file.fieldName, blob, filename);
    }

    return formData;
  }

  if (bodyMode === "form") {
    const form = new URLSearchParams();
    appendSearchParams(form, request.form ?? valueToFormRecord(request.body));
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/x-www-form-urlencoded");
    }
    return form;
  }

  if (bodyMode === "raw") {
    if (contentType && !headers.has("content-type")) {
      headers.set("content-type", contentType);
    }
    return request.body === undefined ? undefined : String(request.body);
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", contentType ?? "application/json");
  }

  return request.body === undefined ? undefined : JSON.stringify(request.body);
}

function appendFormFields(formData: FormData, form?: Record<string, QueryValue>) {
  if (!form) {
    return;
  }

  for (const [key, value] of Object.entries(form)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          formData.append(key, String(item));
        }
      }
    } else if (value !== undefined && value !== null) {
      formData.append(key, String(value));
    }
  }
}

function appendSearchParams(
  params: URLSearchParams,
  form?: Record<string, QueryValue>,
) {
  if (!form) {
    return;
  }

  for (const [key, value] of Object.entries(form)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          params.append(key, String(item));
        }
      }
    } else if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }
}

function valueToFormRecord(value: unknown): Record<string, QueryValue> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, QueryValue>;
}

async function readThinkingDataResponse(args: {
  response: Response;
  url: URL;
  method: string;
  endpoint?: EndpointCatalogEntry;
  responseFormat: ResponseFormat;
  maxBytes: number;
}): Promise<ThinkingDataResponse> {
  const { response, url, method, endpoint, responseFormat, maxBytes } = args;
  const contentType = response.headers.get("content-type") ?? "";
  const headers = Object.fromEntries(response.headers.entries());
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const truncated = buffer.byteLength > maxBytes;
  const clipped = truncated ? buffer.subarray(0, maxBytes) : buffer;

  const base = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: redactToken(url.toString()),
    method,
    endpoint,
    headers,
    byteLength: buffer.byteLength,
    truncated,
  };

  if (responseFormat === "base64" || isProbablyBinary(contentType)) {
    return {
      ...base,
      base64: clipped.toString("base64"),
    };
  }

  const text = clipped.toString("utf8");
  const wantsJson =
    responseFormat === "json" ||
    (responseFormat === "auto" && contentType.includes("json"));

  if (wantsJson) {
    try {
      return {
        ...base,
        data: JSON.parse(text),
      };
    } catch {
      if (responseFormat === "json") {
        throw new Error("Response was not valid JSON.");
      }
    }
  }

  if (responseFormat === "auto") {
    try {
      return {
        ...base,
        data: JSON.parse(text),
      };
    } catch {
      // Fall through to text output.
    }
  }

  return {
    ...base,
    text,
  };
}

function isProbablyBinary(contentType: string) {
  if (!contentType) {
    return false;
  }

  return ![
    "application/json",
    "application/xml",
    "application/x-www-form-urlencoded",
    "text/",
    "csv",
    "tsv",
  ].some((marker) => contentType.includes(marker));
}

function numberFromEnv(name: string) {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
