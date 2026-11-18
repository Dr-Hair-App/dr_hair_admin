import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, fetchBackend, noStoreJson, readJson } from "../../../../_lib/backend";

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  const headerToken = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : undefined;
  const token = cookieToken || headerToken;
  if (!token) return noStoreJson({ message: "Sign in to upload a patient report." }, 401);

  const { userId } = await params;
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return noStoreJson({ message: "Upload a report as multipart form data." }, 400);
  }

  try {
    const upstream = await fetchBackend(`/api/v1/admin/users/${encodeURIComponent(userId)}/reports`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": contentType,
      },
      body: request.body,
      cache: "no-store",
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    return noStoreJson(await readJson(upstream), upstream.status);
  } catch {
    return noStoreJson({ message: "The report storage service is temporarily unavailable." }, 503);
  }
}
