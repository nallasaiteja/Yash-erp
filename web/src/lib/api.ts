// Minimal API client: access token in memory, refresh token in an httpOnly cookie.
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onAuthLost: (() => void) | null = null;

export function setAccessToken(t: string | null) {
  accessToken = t;
}
export function setOnAuthLost(fn: () => void) {
  onAuthLost = fn;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d))
      return d
        .map((e: { loc?: unknown[]; msg?: string }) => {
          const field = e.loc?.filter((x) => x !== "body").join(".");
          return `${field ? field + ": " : ""}${(e.msg || "").replace(/^Value error, /, "")}`;
        })
        .join("; ");
  }
  return `Request failed (${status})`;
}

export async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
        if (!r.ok) return false;
        const data = await r.json();
        accessToken = data.access_token;
        sessionUser = data.user;
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

// Last user payload returned by login/refresh (read by AuthProvider).
export let sessionUser: unknown = null;
export function setSessionUser(u: unknown) {
  sessionUser = u;
}

async function raw(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (res.status === 401 && retry && !path.startsWith("/api/auth/")) {
    if (await refreshSession()) return raw(path, init, false);
    onAuthLost?.();
  }
  return res;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await raw(path, init);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) throw new ApiError(res.status, errorMessage(body, res.status));
  return body as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return { detail: t };
  }
}

export const get = <T>(p: string) => api<T>(p);
export const post = <T>(p: string, b?: unknown) =>
  api<T>(p, { method: "POST", body: b instanceof FormData ? b : b === undefined ? undefined : JSON.stringify(b) });
export const put = <T>(p: string, b: unknown) => api<T>(p, { method: "PUT", body: JSON.stringify(b) });
export const patch = <T>(p: string, b: unknown) => api<T>(p, { method: "PATCH", body: JSON.stringify(b) });
export const del = (p: string) => api<void>(p, { method: "DELETE" });

/** Download an authenticated file (CSV export, document) via a blob. */
export async function download(path: string, fallbackName = "download") {
  const res = await raw(path);
  if (!res.ok) {
    const t = await res.text();
    throw new ApiError(res.status, errorMessage(safeJson(t), res.status));
  }
  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}
