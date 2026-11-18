import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, backendUrl, noStoreJson, readJson } from "../../../_lib/backend";

type RouteContext = { params: Promise<{ referenceNo: string }> };

async function adminToken(request: Request) {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (cookieToken) return cookieToken;
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return undefined;
}

export async function GET(request: Request, { params }: RouteContext) {
  const token = await adminToken(request);
  if (!token) return noStoreJson({ message: "Sign in to view assessment." }, 401);
  const { referenceNo } = await params;
  try {
    const upstream = await fetch(backendUrl(`/api/v1/admin/hair-tests/${encodeURIComponent(referenceNo)}`), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status);
  } catch {
    return noStoreJson({ message: "Assessment is temporarily unavailable." }, 503);
  }
}
