import { NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "drhair_admin_session";

interface ServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

let backendServicePromise: Promise<ServiceBinding | null> | null = null;
let fetchIntercepted = false;

async function getBackendService(): Promise<ServiceBinding | null> {
  if (backendServicePromise) return backendServicePromise;
  backendServicePromise = (async () => {
    try {
      const cf = await import(/* @vite-ignore */ "cloudflare:workers");
      const service = (cf?.env as Record<string, unknown> | undefined)?.BACKEND_SERVICE as ServiceBinding | undefined;
      if (service && typeof service.fetch === "function") {
        return service;
      }
    } catch {
      // Local dev or non-workerd environment
    }
    return null;
  })();
  return backendServicePromise;
}

// Intercept backend fetches so Cloudflare Worker-to-Worker loop protection (404)
// is bypassed transparently via the BACKEND_SERVICE Service Binding.
if (typeof globalThis !== "undefined" && !fetchIntercepted) {
  fetchIntercepted = true;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlString =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : typeof (input as Request)?.url === "string"
        ? (input as Request).url
        : "";

    if (
      urlString.includes("dr-hair-backend") ||
      urlString.includes("api.drhairindia.com") ||
      urlString.includes("/api/v1/")
    ) {
      try {
        const service = await getBackendService();
        if (service) {
          return await service.fetch(input, init);
        }
      } catch {
        // Fall back to native fetch
      }
    }
    return originalFetch.call(this, input, init);
  };
}

export function backendUrl(path: string) {
  const configuredOrigin =
    process.env.DRHAIR_BACKEND_URL?.trim() ||
    "https://api.drhairindia.com";
  const origin = configuredOrigin.replace(/\/+$/, "");
  return `${origin}${path}`;
}

export async function fetchBackend(path: string, init?: RequestInit): Promise<Response> {
  return fetch(backendUrl(path), init);
}

export function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function apiMessage(body: Record<string, unknown>, fallback: string) {
  return typeof body.message === "string" && body.message.trim()
    ? body.message
    : fallback;
}
