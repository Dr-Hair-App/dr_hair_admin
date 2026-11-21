import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, backendUrl, noStoreJson, readJson } from "../../../_lib/backend";

export async function GET() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return noStoreJson({ message: "Sign in to view patient segments." }, 401);
  try {
    const upstream = await fetch(backendUrl("/api/v1/admin/users/segments"), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    return noStoreJson(await readJson(upstream), upstream.status, upstream);
  } catch {
    return noStoreJson({ message: "Patient segments are temporarily unavailable." }, 503);
  }
}
