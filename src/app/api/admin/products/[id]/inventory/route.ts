import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, fetchBackend, noStoreJson, readJson } from "../../../../_lib/backend";

type RouteContext = { params: Promise<{ id: string }> };

async function forward(request: Request, { params }: RouteContext, method: "GET" | "POST") {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to manage product inventory." }, 401);
  const { id } = await params;
  if (!id) return noStoreJson({ message: "Product ID is required." }, 400);

  let body: string | undefined;
  if (method === "POST") {
    try {
      body = JSON.stringify(await request.json());
    } catch {
      return noStoreJson({ message: "Send inventory adjustments as JSON." }, 400);
    }
  }

  try {
    const query = method === "GET" ? new URL(request.url).search : "";
    const upstream = await fetchBackend(`/api/v1/admin/products/${encodeURIComponent(id)}/inventory${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body } : {}),
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status, upstream);
  } catch {
    return noStoreJson({ message: "The inventory service is temporarily unavailable." }, 503);
  }
}

export async function GET(request: Request, context: RouteContext) {
  return forward(request, context, "GET");
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, context, "POST");
}
