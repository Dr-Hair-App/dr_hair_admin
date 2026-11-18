import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, backendUrl, noStoreJson, readJson } from "../../../_lib/backend";

type RouteContext = { params: Promise<{ id: string }> };

async function reviewUrl(params: RouteContext["params"]) {
  const { id } = await params;
  return backendUrl(`/api/v1/admin/reviews/${encodeURIComponent(id)}`);
}

export async function PUT(request: Request, { params }: RouteContext) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to edit patient stories." }, 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: "Send patient story changes as JSON." }, 400);
  }
  try {
    const upstream = await fetch(await reviewUrl(params), {
      method: "PUT",
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
    return noStoreJson({ message: "Reviews service is temporarily unavailable." }, 503);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to delete patient stories." }, 401);
  try {
    const upstream = await fetch(await reviewUrl(params), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status);
  } catch {
    return noStoreJson({ message: "Reviews service is temporarily unavailable." }, 503);
  }
}
