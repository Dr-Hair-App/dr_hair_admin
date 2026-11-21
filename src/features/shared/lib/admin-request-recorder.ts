"use client";

export type AdminRequestCacheOutcome =
  | "network"
  | "miss"
  | "hit"
  | "stale"
  | "coalesced"
  | "refresh"
  | "mutation"
  | "error";

export type AdminRequestRecord = {
  id: number;
  view: string;
  route: string;
  method: string;
  status: number | null;
  duration_ms: number;
  cache_outcome: AdminRequestCacheOutcome;
  occurred_at: string;
};

const MAX_RECORDS = 100;
const listeners = new Set<() => void>();
const records: AdminRequestRecord[] = [];
const SAFE_ROOTS = new Set([
  "accounts", "appointments", "api-traffic", "audit-logs", "categories",
  "commerce", "content", "coupons", "dashboard", "exports", "features",
  "hair-tests", "health", "media", "notifications", "orders", "payments", "products",
  "releases", "reports", "reviews", "support", "treatments", "users",
]);
const ROUTE_TEMPLATES: Record<string, string[][]> = {
  accounts: [[":id"], [":id", "access"], [":id", "access", "status"], [":id", "status"]],
  appointments: [[":id"], [":id", "refund"], ["schedule"], ["billing"], ["closed-dates"], ["closed-dates", ":date"]],
  categories: [[":id"]],
  commerce: [["sales-report"]],
  content: [[":id"], [":id", "status"]],
  coupons: [[":id"]],
  dashboard: [["summary"]],
  exports: [[":type"]],
  features: [[":key"]],
  "hair-tests": [[":id"], [":id", "status"]],
  health: [],
  media: [["videos"], ["videos", ":id"], ["videos", "status"], ["videos", "youtube"]],
  notifications: [],
  orders: [[":id"], [":id", "cancel"], [":id", "refund"], [":id", "fulfillment"], [":id", "tracking"], [":id", "shiprocket"], [":id", "shiprocket", "pickup", "retry"], [":id", "shiprocket", "return"]],
  payments: [],
  products: [[":id"], [":id", "inventory"]],
  releases: [[":platform"]],
  reports: [[":id"], ["mine"]],
  reviews: [[":id"]],
  users: [
    ["segments"], [":id"], [":id", "status"], [":id", "archive"], [":id", "diet-plan"],
    [":id", "reports"], [":id", "reports", ":reportId"], [":id", "reports", ":reportId", "download"],
    [":id", "reports", ":reportId", "restore"], [":id", "reports", ":reportId", "visibility"],
    [":id", "assessments", ":assessmentId", "photos", ":index"],
    [":id", "progress-checkins", ":checkInId"],
  ],
};

let currentView = "overview";
let suppressNetworkCapture = 0;
let recordId = 0;

function emit() {
  for (const listener of listeners) listener();
}

/** Normalize only known Admin API route shapes; unknown path pieces are discarded. */
export function sanitizeAdminRoute(input: string | URL): string | null {
  let pathname: string;
  try {
    pathname = new URL(input.toString(), "http://admin.local").pathname;
  } catch {
    return null;
  }
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "api" || segments[1] !== "admin" || !segments[2]) return null;
  const root = segments[2].toLowerCase();
  if (!SAFE_ROOTS.has(root) || root === "api-traffic") return null;
  const tail = segments.slice(3).map(decodeURIComponentSafe);
  const templates = ROUTE_TEMPLATES[root];
  const matched = templates?.find((template) => template.length === tail.length && template.every((part, index) => part.startsWith(":") || part === tail[index]));
  const safeTail = matched ? matched.map((part) => part.startsWith(":")
    ? part === ":date" || part === ":index" ? part : ":id"
    : part) : [];
  return `/api/admin/${root}${safeTail.length ? `/${safeTail.join("/")}` : ""}`;
}

function decodeURIComponentSafe(value: string): string {
  try { return decodeURIComponent(value).toLowerCase(); } catch { return ""; }
}

export function setAdminRequestView(view: string): void {
  currentView = /^[a-z][a-zA-Z0-9_-]{0,39}$/.test(view) ? view : "admin";
}

export function getAdminRequestView(): string {
  return currentView;
}

export function recordAdminRequest(input: {
  url: string | URL;
  method?: string;
  status?: number | null;
  durationMs: number;
  cacheOutcome: AdminRequestCacheOutcome;
  view?: string;
}): void {
  const route = sanitizeAdminRoute(input.url);
  if (!route) return;
  const method = (input.method || "GET").toUpperCase();
  const record: AdminRequestRecord = {
    id: ++recordId,
    view: input.view || currentView,
    route,
    method: /^[A-Z]{3,8}$/.test(method) ? method : "OTHER",
    status: Number.isInteger(input.status) ? input.status! : null,
    duration_ms: Math.max(0, Math.round(input.durationMs * 10) / 10),
    cache_outcome: input.cacheOutcome,
    occurred_at: new Date().toISOString(),
  };
  records.unshift(record);
  records.length = Math.min(records.length, MAX_RECORDS);
  emit();
}

export function getAdminRequestRecords(): AdminRequestRecord[] {
  return records.slice();
}

export function subscribeAdminRequestRecords(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearAdminRequestRecords(): void {
  records.length = 0;
  emit();
}

/** Suppress global direct-fetch capture while the cache records the logical request outcome. */
export function fetchWithoutAdminRequestCapture(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  suppressNetworkCapture += 1;
  try {
    return fetch(input, init);
  } finally {
    suppressNetworkCapture = Math.max(0, suppressNetworkCapture - 1);
  }
}

export function installAdminFetchRecorder(): () => void {
  if (typeof window === "undefined") return () => {};
  const originalFetch = window.fetch;
  const wrappedFetch: typeof window.fetch = async function (input, init) {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = sanitizeAdminRoute(rawUrl);
    if (!route || suppressNetworkCapture > 0) return originalFetch.call(this, input, init);
    const startedAt = performance.now();
    const requestView = getAdminRequestView();
    const method = init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
    try {
      const response = await originalFetch.call(this, input, init);
      recordAdminRequest({ url: rawUrl, method, status: response.status, durationMs: performance.now() - startedAt, cacheOutcome: "network", view: requestView });
      return response;
    } catch (error) {
      recordAdminRequest({ url: rawUrl, method, status: null, durationMs: performance.now() - startedAt, cacheOutcome: "error", view: requestView });
      throw error;
    }
  };
  window.fetch = wrappedFetch;
  return () => {
    if (window.fetch === wrappedFetch) window.fetch = originalFetch;
  };
}
