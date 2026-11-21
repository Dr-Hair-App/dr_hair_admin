import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, backendUrl, fetchBackend, noStoreJson, readJson } from "../../_lib/backend";
import { forwardAdminMediaMultipart } from "../forward-admin-media-multipart.js";

export async function GET(request: Request) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to view app content." }, 401);
  const query = new URL(request.url).searchParams.toString();
  try {
    const upstream = await fetch(backendUrl(`/api/v1/admin/content${query ? `?${query}` : ""}`), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status);
  } catch {
    return noStoreJson({ message: "App content service is temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to create app content." }, 401);
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.toLowerCase().startsWith("multipart/form-data;")) {
      const upstream = await forwardAdminMediaMultipart(request, "/api/v1/admin/content", "POST", token, fetchBackend);
      return noStoreJson(await readJson(upstream), upstream.status);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return noStoreJson({ message: "Send app content as JSON or multipart form data." }, 400);
    }
    const upstream = await fetch(backendUrl("/api/v1/admin/content"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status);
  } catch {
    return noStoreJson({ message: "App content service is temporarily unavailable." }, 503);
  }
}
