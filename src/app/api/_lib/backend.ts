import { NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "drhair_admin_session";

export function backendUrl(path: string) {
  const configuredOrigin = process.env.DRHAIR_BACKEND_URL?.trim();
  if (!configuredOrigin) {
    throw new Error("DRHAIR_BACKEND_URL is not configured for this deployment.");
  }
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
