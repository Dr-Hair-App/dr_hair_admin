import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, fetchBackend, noStoreJson, readJson } from "../../../_lib/backend";
import { forwardAdminMediaUpload } from "./forward-media-upload.js";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const headerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value || headerToken;
  if (!token) return noStoreJson({ message: "Sign in to upload media." }, 401);

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return noStoreJson({ message: "Upload one file as multipart form data." }, 400);
  }

  try {
    if (!request.body) return noStoreJson({ message: "Attach one or more image files." }, 400);

    const upstream = await forwardAdminMediaUpload(request, token, fetchBackend);

    const body = await readJson(upstream);
    return noStoreJson(body, upstream.status);
  } catch (err) {
    return noStoreJson({ message: err instanceof Error ? err.message : "The media service is temporarily unavailable." }, 503);
  }
}

export async function DELETE(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const headerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value || headerToken;
  if (!token) return noStoreJson({ message: "Sign in to remove media." }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: "Send the uploaded media ID as JSON." }, 400);
  }
  if (!body || typeof body !== "object" || typeof (body as { public_id?: unknown }).public_id !== "string") {
    return noStoreJson({ message: "A stored media ID is required." }, 400);
  }

  try {
    const upstream = await fetchBackend("/api/v1/media", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ public_id: (body as { public_id: string }).public_id, resource_type: "image" }),
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status);
  } catch {
    return noStoreJson({ message: "The media service is temporarily unavailable." }, 503);
  }
}
