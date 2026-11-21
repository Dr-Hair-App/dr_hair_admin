import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, backendUrl, noStoreJson, readJson } from "../../../../_lib/backend";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to publish app content." }, 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: "Send the content status as JSON." }, 400);
  }
  try {
    const { id } = await params;
    const upstream = await fetch(backendUrl(`/api/v1/admin/content/${encodeURIComponent(id)}/status`), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status, upstream);
  } catch {
    return noStoreJson({ message: "App content service is temporarily unavailable." }, 503);
  }
}
