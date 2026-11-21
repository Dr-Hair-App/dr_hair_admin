import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, fetchBackend, noStoreJson, readJson } from "../../../_lib/backend";
import { forwardAdminProductJson, forwardAdminProductMultipart } from "../forward-product-multipart.js";

type RouteContext = { params: Promise<{ id: string }> };

async function adminToken() {
  return (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!id) return noStoreJson({ message: "Product ID is required." }, 400);
  try {
    const upstream = await fetchBackend(`/api/v1/products/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status, upstream);
  } catch {
    return noStoreJson({ message: "The product service is temporarily unavailable." }, 503);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const token = await adminToken();
  if (!token) return noStoreJson({ message: "Sign in to update products." }, 401);
  const { id } = await params;
  if (!id) return noStoreJson({ message: "Product ID is required." }, 400);
  const contentType = request.headers.get("content-type") || "";

  // Preserve the metadata-only JSON PATCH used by the archive action and any
  // older admin callers. ProductEditor itself sends multipart/form-data.
  if (contentType.toLowerCase().startsWith("application/json")) {
    let product: unknown;
    try {
      product = await request.json();
    } catch {
      return noStoreJson({ message: "Send valid product updates as JSON." }, 400);
    }
    try {
      const upstream = await forwardAdminProductJson(
        product,
        `/api/v1/admin/products/${encodeURIComponent(id)}`,
        "PATCH",
        token,
        fetchBackend,
      );
      return noStoreJson(await readJson(upstream), upstream.status, upstream);
    } catch {
      return noStoreJson({ message: "The product service is temporarily unavailable." }, 503);
    }
  }

  try {
    const upstream = await forwardAdminProductMultipart(
      request,
      `/api/v1/admin/products/${encodeURIComponent(id)}`,
      "PATCH",
      token,
      fetchBackend,
    );
    return noStoreJson(await readJson(upstream), upstream.status, upstream);
  } catch (error) {
    if (error instanceof TypeError) return noStoreJson({ message: error.message }, 415);
    return noStoreJson({ message: "The product service is temporarily unavailable." }, 503);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const token = await adminToken();
  if (!token) return noStoreJson({ message: "Sign in to delete products." }, 401);
  const { id } = await params;
  if (!id) return noStoreJson({ message: "Product ID is required." }, 400);

  try {
    const upstream = await fetchBackend(`/api/v1/admin/products/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status, upstream);
  } catch {
    return noStoreJson({ message: "The product service is temporarily unavailable." }, 503);
  }
}
