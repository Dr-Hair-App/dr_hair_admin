import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, cacheableJson, fetchBackend, noStoreJson, readJson } from "../../_lib/backend";

async function adminToken() {
  return (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
}

export async function GET(request: NextRequest) {
  const token = await adminToken();
  if (!token) return noStoreJson({ status: "error", message: "Sign in to view categories." }, 401);
  try {
    const type = request.nextUrl.searchParams.get("type");
    const path = type
      ? `/api/v1/categories?type=${encodeURIComponent(type)}`
      : "/api/v1/categories";
    const upstream = await fetchBackend(path, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const data = await readJson(upstream);
    if (upstream.ok) {
      return cacheableJson(data, 60, 300, upstream.status);
    }
    return noStoreJson(data, upstream.status, upstream);
  } catch {
    return noStoreJson({ status: "error", message: "Failed to fetch categories" }, 500);
  }
}

export async function POST(request: NextRequest) {
  const token = await adminToken();
  if (!token) return noStoreJson({ status: "error", message: "Sign in to manage categories." }, 401);
  try {
    const body = await request.json();
    const upstream = await fetchBackend("/api/v1/admin/categories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await readJson(upstream);
    return noStoreJson(data, upstream.status, upstream);
  } catch {
    return noStoreJson({ status: "error", message: "Failed to create category" }, 500);
  }
}
