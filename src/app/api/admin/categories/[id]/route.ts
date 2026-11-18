import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, fetchBackend, noStoreJson, readJson } from "../../../_lib/backend";

type RouteContext = { params: Promise<{ id: string }> };

async function adminToken() {
  return (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
}

export async function PUT(
  request: Request,
  { params }: RouteContext
) {
  const token = await adminToken();
  if (!token) return noStoreJson({ status: "error", message: "Sign in to manage categories." }, 401);
  try {
    const { id } = await params;
    const body = await request.json();
    const upstream = await fetchBackend(`/api/v1/admin/categories/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await readJson(upstream);
    return noStoreJson(data, upstream.status);
  } catch {
    return noStoreJson({ status: "error", message: "Failed to update category" }, 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext
) {
  const token = await adminToken();
  if (!token) return noStoreJson({ status: "error", message: "Sign in to manage categories." }, 401);
  try {
    const { id } = await params;
    const upstream = await fetchBackend(`/api/v1/admin/categories/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const data = await readJson(upstream);
    return noStoreJson(data, upstream.status);
  } catch {
    return noStoreJson({ status: "error", message: "Failed to delete category" }, 500);
  }
}

