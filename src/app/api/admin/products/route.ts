import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, cacheableJson, fetchBackend, noStoreJson, readJson } from "../../_lib/backend";
import { forwardAdminProductJson, forwardAdminProductMultipart } from "./forward-product-multipart.js";

async function adminToken() {
  return (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
}

export async function GET(request: Request) {
  const token = await adminToken();
  const { searchParams } = new URL(request.url);
  if (!searchParams.has("limit")) searchParams.set("limit", "100");
  if (!searchParams.has("status")) searchParams.set("status", "all");
  const queryString = searchParams.toString();
  const path = `/api/v1/admin/products?${queryString}`;

  try {
    const upstream = await fetchBackend(path, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: "application/json",
      },
    });
    const data = await readJson(upstream);
    if (upstream.ok) {
      return cacheableJson(data, 60, 300, upstream.status);
    }
    return noStoreJson(data, upstream.status, upstream);
  } catch {
    return noStoreJson({ message: "The product service is temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  const token = await adminToken();
  if (!token) return noStoreJson({ message: "Sign in to add products." }, 401);
  const contentType = request.headers.get("content-type") || "";
  if (contentType.toLowerCase().startsWith("application/json")) {
    let product: unknown;
    try {
      product = await request.json();
    } catch {
      return noStoreJson({ message: "Send valid product details as JSON." }, 400);
    }
    try {
      const upstream = await forwardAdminProductJson(product, "/api/v1/admin/products", "POST", token, fetchBackend);
      return noStoreJson(await readJson(upstream), upstream.status, upstream);
    } catch {
      return noStoreJson({ message: "The product service is temporarily unavailable." }, 503);
    }
  }
  try {
    const upstream = await forwardAdminProductMultipart(request, "/api/v1/admin/products", "POST", token, fetchBackend);
    return noStoreJson(await readJson(upstream), upstream.status, upstream);
  } catch (error) {
    if (error instanceof TypeError) return noStoreJson({ message: error.message }, 415);
    return noStoreJson({ message: "The product service is temporarily unavailable." }, 503);
  }
}
