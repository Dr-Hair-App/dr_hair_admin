import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, backendUrl, fetchBackend, noStoreJson, readJson } from "../../_lib/backend";
import { forwardAdminMediaMultipart } from "../forward-admin-media-multipart.js";

export async function GET(request: Request) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to manage patient reviews." }, 401);

  const { searchParams } = new URL(request.url);
  const upstreamUrl = backendUrl(`/api/v1/admin/reviews?${searchParams.toString()}`);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status);
  } catch {
    return noStoreJson({ message: "Reviews service is temporarily unavailable." }, 503);
  }
}

export async function PATCH(request: Request) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to moderate reviews." }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: "Send moderation action as JSON." }, 400);
  }

  try {
    const upstream = await fetch(backendUrl("/api/v1/admin/reviews/status"), {
      method: "PATCH",
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
    return noStoreJson({ message: "Failed to update review moderation status." }, 503);
  }
}

export async function POST(request: Request) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to add patient stories." }, 401);
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.toLowerCase().startsWith("multipart/form-data;")) {
      const upstream = await forwardAdminMediaMultipart(request, "/api/v1/admin/reviews", "POST", token, fetchBackend);
      return noStoreJson(await readJson(upstream), upstream.status);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return noStoreJson({ message: "Send patient story details as JSON or multipart form data." }, 400);
    }
    const upstream = await fetch(backendUrl("/api/v1/admin/reviews"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status);
  } catch {
    return noStoreJson({ message: "Reviews service is temporarily unavailable." }, 503);
  }
}
