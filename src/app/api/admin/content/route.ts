import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, backendUrl, noStoreJson, readJson } from "../../_lib/backend";

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ message: "Send app content as JSON." }, 400);
  }
  try {
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
