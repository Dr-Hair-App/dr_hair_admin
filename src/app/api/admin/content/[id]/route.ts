import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, backendUrl, fetchBackend, noStoreJson, readJson } from "../../../_lib/backend";
import { forwardAdminMediaMultipart } from "../../forward-admin-media-multipart.js";

type RouteContext = { params: Promise<{ id: string }> };

async function contentUrl(params: RouteContext["params"]) {
  const { id } = await params;
  return backendUrl(`/api/v1/admin/content/${encodeURIComponent(id)}`);
}

export async function PUT(request: Request, { params }: RouteContext) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to edit app content." }, 401);
  try {
    const { id } = await params;
    const path = `/api/v1/admin/content/${encodeURIComponent(id)}`;
    const contentType = request.headers.get("content-type") || "";
    if (contentType.toLowerCase().startsWith("multipart/form-data;")) {
      const upstream = await forwardAdminMediaMultipart(request, path, "PUT", token, fetchBackend);
      return noStoreJson(await readJson(upstream), upstream.status, upstream);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return noStoreJson({ message: "Send app content changes as JSON or multipart form data." }, 400);
    }
    const upstream = await fetch(backendUrl(path), {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status, upstream);
  } catch {
    return noStoreJson({ message: "App content service is temporarily unavailable." }, 503);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to delete app content." }, 401);
  try {
    const upstream = await fetch(await contentUrl(params), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status, upstream);
  } catch {
    return noStoreJson({ message: "App content service is temporarily unavailable." }, 503);
  }
}
